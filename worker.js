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

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunk)
    );
  }

  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  return hex(
    await crypto.subtle.digest("SHA-256", bytes)
  );
}

async function razorpay(path, env, options = {}) {
  const auth = btoa(
    env.RAZORPAY_KEY_ID +
    ":" +
    env.RAZORPAY_KEY_SECRET
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
      data?.error?.description ||
      "Razorpay request failed."
    );
  }

  return data;
}

async function razorpaySignature(env, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      env.RAZORPAY_KEY_SECRET
    ),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
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

async function generateImage(
  env,
  referenceBytes,
  prompt,
  width,
  height
) {
  const form = new FormData();

  form.append(
    "input_image_0",
    new Blob(
      [referenceBytes],
      { type: "image/jpeg" }
    ),
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
      contentType:
        multipart.headers.get("content-type")
    }
  });

  if (!result?.image) {
    throw new Error(
      "AI image generation failed."
    );
  }

  return base64ToBytes(result.image);
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

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
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

        if (
          !photo ||
          typeof photo === "string"
        ) {
          return json(
            {
              success: false,
              error: "Please upload a photo."
            },
            400
          );
        }

        if (!photo.type.startsWith("image/")) {
          return json(
            {
              success: false,
              error: "Only image files are allowed."
            },
            400
          );
        }

        if (photo.size > 10 * 1024 * 1024) {
          return json(
            {
              success: false,
              error:
                "Image must be smaller than 10 MB."
            },
            400
          );
        }

        const bytes = new Uint8Array(
          await photo.arrayBuffer()
        );

        const photoHash = await sha256(bytes);
        const images = [];

        for (const style of styles) {
          const image = await generateImage(
            env,
            bytes,
            style.prompt,
            512,
            682
          );

          images.push({
            name: style.name,
            image:
              "data:image/png;base64," +
              bytesToBase64(image)
          });
        }

        return json({
          success: true,
          sessionId: crypto.randomUUID(),
          photoHash,
          images
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/create-order"
      ) {
        const body = await request.json();

        if (
          !body.sessionId ||
          !body.photoHash
        ) {
          return json(
            {
              success: false,
              error: "Session information missing."
            },
            400
          );
        }

        const order = await razorpay(
          "orders",
          env,
          {
            method: "POST",
            body: {
              amount: PRICE,
              currency: CURRENCY,
              receipt:
                "sketch_" +
                body.sessionId,
              notes: {
                sessionId: body.sessionId,
                photoHash: body.photoHash
              }
            }
          }
        );

        return json({
          success: true,
          orderId: order.id,
          amount: PRICE,
          currency: CURRENCY,
          keyId: env.RAZORPAY_KEY_ID
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/verify-payment"
      ) {
        const form = await request.formData();

        const sessionId =
          form.get("sessionId");

        const photoHash =
          form.get("photoHash");

        const orderId =
          form.get("razorpay_order_id");

        const paymentId =
          form.get("razorpay_payment_id");

        const signature =
          form.get("razorpay_signature");

        const photo =
          form.get("photo");

        if (
          !sessionId ||
          !photoHash ||
          !orderId ||
          !paymentId ||
          !signature ||
          !photo ||
          typeof photo === "string"
        ) {
          return json(
            {
              success: false,
              error:
                "Payment information is incomplete."
            },
            400
          );
        }

        const bytes = new Uint8Array(
          await photo.arrayBuffer()
        );

        if (
          await sha256(bytes) !==
          photoHash
        ) {
          return json(
            {
              success: false,
              error:
                "Photo verification failed."
            },
            400
          );
        }

        const expected =
          await razorpaySignature(
            env,
            orderId + "|" + paymentId
          );

        if (signature !== expected) {
          return json(
            {
              success: false,
              error:
                "Invalid payment signature."
            },
            400
          );
        }

        const order = await razorpay(
          "orders/" + orderId,
          env
        );

        if (
          order.amount !== PRICE ||
          order.currency !== CURRENCY
        ) {
          return json(
            {
              success: false,
              error:
                "Payment amount verification failed."
            },
            400
          );
        }

        if (
          order.notes?.sessionId !==
            sessionId ||
          order.notes?.photoHash !==
            photoHash
        ) {
          return json(
            {
              success: false,
              error:
                "Payment session mismatch."
            },
            400
          );
        }

        const payment =
          await razorpay(
            "payments/" + paymentId,
            env
          );

        if (
          payment.order_id !== orderId ||
          payment.amount !== PRICE ||
          payment.currency !== CURRENCY ||
          payment.status !== "captured"
        ) {
          return json(
            {
              success: false,
              error:
                "Payment has not been successfully captured."
            },
            400
          );
        }

        const images = [];

        for (const style of styles) {
          const image = await generateImage(
            env,
            bytes,
            style.prompt,
            1024,
            1365
          );

          images.push({
            name: style.name,
            image:
              "data:image/png;base64," +
              bytesToBase64(image)
          });
        }

        return json({
          success: true,
          images
        });
      }

      return json(
        {
          success: false,
          error: "Endpoint not found."
        },
        404
      );

    } catch (error) {
      return json(
        {
          success: false,
          error:
            error?.message ||
            "Server error."
        },
        500
      );
    }
  }
};
