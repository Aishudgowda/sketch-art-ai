const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const PRICE = 9900;
const CURRENCY = "INR";

const styles = [
  {
    name: "Pencil Portrait",
    prompt: `Create a highly detailed professional hand-drawn pencil portrait from the reference photo. Preserve the same person's identity, facial structure, eyes, nose, lips, hairstyle and proportions. Monochrome graphite pencil on clean white paper, realistic facial shading, fine pencil strokes, delicate cross-hatching, rich tonal depth, professional traditional sketch. No color, no cartoon, no simple edge filter, no distorted face.`
  },
  {
    name: "Ink + Pencil",
    prompt: `Create a premium realistic hand-drawn ink and pencil portrait from the reference photo. Keep the same person's identity and recognizable facial features. Black ink outlines combined with detailed graphite shading, fine cross-hatching, artistic linework, white paper background, realistic proportions, professional illustration quality. No color, no cartoon, no simple tracing, no distorted face.`
  },
  {
    name: "Time Travel Art",
    prompt: `Create a premium monochrome hand-drawn pencil and ink portrait from the reference photo. Preserve the same person's identity and facial features. Add an elegant vintage clock, mechanical gears, small vintage airplane with motion trails, compass and subtle time-travel arcs around the portrait. Detailed graphite shading, fine cross-hatching, realistic face, white paper. No color, no cartoon, no distorted face.`
  },
  {
    name: "Premium Sketch",
    prompt: `Create an exceptionally detailed premium realistic pencil-and-ink portrait from the reference photo. Keep the same person's identity, facial structure and hairstyle. Use sophisticated fine-line drawing, realistic graphite shading and cross-hatching. Add subtle gears, compass, clock and flowing sketch lines. White paper background, professional traditional hand-drawn illustration. Monochrome only, no cartoon, no distorted face.`
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
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    )
  );
}

async function razorpay(path, env, options = {}) {

  if (
    !env.RAZORPAY_KEY_ID ||
    !env.RAZORPAY_KEY_SECRET
  ) {
    throw new Error(
      "Razorpay is not configured."
    );
  }

  const auth = btoa(
    env.RAZORPAY_KEY_ID +
    ":" +
    env.RAZORPAY_KEY_SECRET
  );

  const response = await fetch(
    "https://api.razorpay.com/v1/" + path,
    {
      method:
        options.method || "GET",

      headers: {
        "Authorization":
          "Basic " + auth,

        "Content-Type":
          "application/json"
      },

      body:
        options.body
          ? JSON.stringify(options.body)
          : undefined
