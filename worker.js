const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const PRICE = 9900;
const CURRENCY = "INR";

const styles = [
  {
    name: "Pencil Portrait",
    prompt: `Create a highly detailed professional hand-drawn pencil portrait from the reference photo.
Preserve the same person's identity, facial structure, eyes, nose, lips, hairstyle and proportions.
Monochrome graphite pencil on clean white paper, realistic facial shading, fine pencil strokes,
delicate cross-hatching, rich tonal depth, professional traditional sketch.
No color, no cartoon, no simple edge filter, no distorted face.`
  },
  {
    name: "Ink + Pencil",
    prompt: `Create a premium realistic hand-drawn ink and pencil portrait from the reference photo.
Keep the same person's identity and recognizable facial features.
Black ink outlines combined with detailed graphite shading, fine cross-hatching, artistic linework,
white paper background, realistic proportions, professional illustration quality.
No color, no cartoon, no simple tracing, no distorted face.`
  },
  {
    name: "Time Travel Art",
    prompt: `Create a premium monochrome hand-drawn pencil and ink portrait from the reference photo.
Preserve the same person's identity and facial features.
Add an elegant vintage clock, mechanical gears, small vintage airplane with motion trails,
compass and subtle time-travel arcs around the portrait.
Detailed graphite shading, fine cross-hatching, realistic face, white paper.
No color, no cartoon, no distorted face.`
  },
  {
    name: "Premium Sketch",
    prompt: `Create an exceptionally detailed premium realistic pencil-and-ink portrait from the reference photo.
Keep the same person's identity, facial structure and hairstyle.
Use sophisticated fine-line drawing, realistic graphite shading and cross-hatching.
Add subtle gears, compass, clock and flowing sketch lines.
White paper background, professional traditional hand-drawn illustration.
Monochrome only, no cartoon, no distorted face.`
  }
];

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors()
    }
  });
}

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return hex(hash);
}

function b64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function razorpay(path, env, options = {}) {
  const auth = btoa(
    env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET
  );

  const response = await fetch(
    "https://api.razorpay.com/v1/" + path,
    {
      method: options.method || "GET",
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json"
      },
      body: options.body
        ? JSON.stringify(options.body)
        : undefined
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.description || "Razorpay request failed."
    );
  }

  return data;
}

async function razorpaySignature(env, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.RAZORPAY_KEY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const result = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text)
  );

  return hex(result);
}

async function generate(env, referenceBytes, prompt, width, height) {
  const form = new FormData();

  form.append(
    "input_image_0",
    new Blob([referenceBytes], { type: "image/jpeg" }),
    "reference.jpg"
  );

  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("guidance", "3.5");

  const multipart = new Response(form);

  const result = await env.AI.run(MODEL, {
    multipart: {
      body: multipart.body,
      contentType: multipart.headers.get("content-type")
    }
  });

  if (!result?.image) {
    throw new Error("AI image generation failed.");
  }

  return b64ToBytes(result.image);
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors()
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "Sketch Art AI",
        worldwide: true
      });
    }

    try {

      if (
        request.method === "GET" &&
        url.pathname === "/api/config"
      ) {
        return json({
          success: true,
          keyId: env.RAZORPAY_KEY_ID
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/generate"
      ) {

        const form = await request.formData();
        const photo = form.get("photo");

        if (!photo || typeof photo === "string") {
          return json({
            success: false,
            error: "Please upload a photo."
          }, 400);
        }

        if (!photo.type.startsWith("image/")) {
          return json({
            success: false,
            error: "Only image files are allowed."
          }, 400);
        }

        if (photo.size > 10 * 1024 * 1024) {
          return json({
            success: false,
            error: "Image must be smaller than 10 MB."
          }, 400);
        }

        const bytes = new Uint8Array(
          await photo.arrayBuffer()
        );

        const photoHash = await sha256(bytes);

        const images = [];

        for (const style of styles) {

          const image = await generate(
            env,
            bytes,
            style.prompt,
            512,
            682
          );

          const base64 = btoa(
            String.fromCharCode(...image)
          );

          images.push({
            name: style.name,
            image: `data:image/png;base64,${base64}`
          });
        }

        const sessionId = crypto.randomUUID();

        return json({
          success: true,
          sessionId,
          photoHash,
          images
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/create-order"
      ) {

        const body = await request.json();

        if (!body.sessionId || !body.photoHash) {
          return json({
            success: false,
            error: "Session information missing."
          },
