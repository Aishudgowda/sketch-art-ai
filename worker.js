const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const PRICE = 9900; // ₹99 in paise
const CURRENCY = "INR";

const styles = [
  {
    name: "Pencil Portrait",
    prompt: `Create a highly detailed professional hand-drawn pencil portrait from the reference photo.
Preserve the same person's identity, facial structure, eyes, nose, lips, hairstyle and proportions.
Monochrome graphite pencil on clean white paper, realistic facial shading, fine pencil strokes,
delicate cross-hatching, rich tonal depth, natural skin texture, professional traditional sketch.
No color, no cartoon, no simple edge filter, no distorted face.`
  },
  {
    name: "Ink + Pencil",
    prompt: `Transform the reference photo into a premium realistic hand-drawn ink and pencil portrait.
Keep the same person's identity and recognizable facial features.
Black ink outlines combined with detailed graphite shading, fine cross-hatching, artistic linework,
white paper background, realistic proportions, professional illustration quality.
No color, no cartoon, no simple tracing, no distorted face.`
  },
  {
    name: "Time Travel Art",
    prompt: `Create a premium monochrome hand-drawn pencil and ink portrait using the reference photo.
Preserve the same person's identity and facial features.
Surround the portrait with an elegant vintage Roman numeral clock, mechanical gears,
a small vintage airplane with motion trails, compass and subtle swirling time-travel arcs.
Detailed graphite shading, fine cross-hatching, realistic face, white paper,
professional artistic composition, dramatic but clean.
No color, no cartoon, no readable text except clock numerals, no distorted face.`
  },
  {
    name: "Premium Sketch",
    prompt: `Create an exceptionally detailed premium realistic pencil-and-ink portrait from the reference photo.
The person must remain clearly recognizable with the same facial structure and hairstyle.
Use sophisticated fine-line drawing, realistic graphite shading, cross-hatching and deep tonal detail.
Add subtle artistic decorative elements such as elegant gears, compass, clock and flowing sketch lines.
White paper background, museum-quality traditional hand-drawn illustration.
Monochrome only, no cartoon, no simple edge filter, no distorted face.`
  }
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function imageResponse(base64) {
  const binary = Uint8Array.from(
    atob(base64),
    c => c.charCodeAt(0)
  );

  return new Response(binary, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "attachment; filename=\"sketch-art.png\"",
      "Cache-Control": "no-store",
      ...corsHeaders()
    }
  });
}

async function generateImage(env, imageBlob, prompt) {
  const form = new FormData();

  form.append(
    "input_image_0",
    imageBlob,
    "reference.png"
  );

  form.append("prompt", prompt);
  form.append("width", "768");
  form.append("height", "1024");
  form.append("guidance", "3.5");

  const formResponse = new Response(form);

  const result = await env.AI.run(MODEL, {
    multipart: {
      body: formResponse.body,
      contentType: formResponse.headers.get("content-type")
    }
  });

  if (!result || !result.image) {
    throw new Error("AI image generation failed.");
  }

  return result.image;
}

function base64ToBytes(base64) {
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSHA256(secret, message) {
  const encoder = new TextEncoder();

  const keyData = encoder.encode(secret);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );

  return bytesToHex(new Uint8Array(signature));
}

async function createRazorpayOrder(env) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured.");
  }

  const auth = btoa(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
  );

  const receipt =
    "sketch_" +
    Date.now() +
    "_" +
    crypto.randomUUID().replaceAll("-", "").slice(0, 10);

  const response = await fetch(
    "https://api.razorpay.com/v1/orders",
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: PRICE,
        currency: CURRENCY,
        receipt: receipt
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      "Unable to create Razorpay order."
    );
  }

  return data;
}

async function getRazorpayPayment(env, paymentId) {
  const auth = btoa(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
  );

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Basic ${auth}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      "Unable to verify payment."
    );
  }

  return data;
}

async function verifyPayment(env, orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) {
    throw new Error("Payment information is incomplete.");
  }

  const generatedSignature = await hmacSHA256(
    env.RAZORPAY_KEY_SECRET,
    `${orderId}|${paymentId}`
  );

  if (generatedSignature !== signature) {
    throw new Error("Invalid payment signature.");
  }

  const payment = await getRazorpayPayment(
    env,
    paymentId
  );

  if (payment.order_id !== orderId) {
    throw new Error("Payment order mismatch.");
  }

  if (Number(payment.amount) !== PRICE) {
    throw new Error("Payment amount mismatch.");
  }

  if (payment.currency !== CURRENCY) {
    throw new Error("Payment currency mismatch.");
  }

  if (payment.status !== "captured") {
    throw new Error(
      `Payment is not captured. Current status: ${payment.status}`
    );
  }

  return payment;
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);

    // --------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json({
        ok: true,
        message: "Sketch Art AI API is running"
      });
    }

    // --------------------------------------------------
    // CREATE RAZORPAY ₹99 ORDER
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/create-order"
    ) {
      try {
        const order = await createRazorpayOrder(env);

        return json({
          success: true,
          key_id: env.RAZORPAY_KEY_ID,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency
});

      } catch (error) {
        return json({
          success: false,
          error: error?.message || "Unable to create payment order."
        }, 500);
      }
    }

    // PAID DOWNLOAD
    if (
      request.method === "POST" &&
      url.pathname === "/api/download"
    ) {
      try {
        const form = await request.formData();

        const photo = form.get("photo");
        const styleIndex = Number(form.get("styleIndex"));

        const razorpayOrderId = form.get("razorpay_order_id");
        const razorpayPaymentId = form.get("razorpay_payment_id");
        const razorpaySignature = form.get("razorpay_signature");

        if (!photo || typeof photo === "string") {
          return json({
            success: false,
            error: "Photo is required."
          }, 400);
        }

        if (!photo.type || !photo.type.startsWith("image/")) {
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

        if (
          !Number.isInteger(styleIndex) ||
          styleIndex < 0 ||
          styleIndex >= styles.length
        ) {
          return json({
            success: false,
            error: "Invalid sketch style."
          }, 400);
        }

        await verifyPayment(
          env,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature
        );

        const image = await generateImage(
          env,
          photo,
          styles[styleIndex].prompt
        );

        return imageResponse(image);

      } catch (error) {
        return json({
          success: false,
          error: error?.message || "Paid download failed."
        }, 500);
      }
    }

    // FREE PREVIEW GENERATION
    if (
      request.method === "POST" &&
      url.pathname === "/api/generate"
    ) {
      try {
        const form = await request.formData();
        const photo = form.get("photo");

        if (!photo || typeof photo === "string") {
          return json({
            success: false,
            error: "Please upload a photo."
          }, 400);
        }

        if (!photo.type || !photo.type.startsWith("image/")) {
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

        const results = [];

        for (const style of styles) {
          const image = await generateImage(
            env,
            photo,
            style.prompt
          );

          results.push({
            name: style.name,
            image: `data:image/png;base64,${image}`
          });
        }

        return json({
          success: true,
          images: results
        });

      } catch (error) {
        return json({
          success: false,
          error: error?.message || "Image generation failed."
        }, 500);
      }
    }

    return json({
      success: false,
      error: "Endpoint not found."
    }, 404);

  } catch (error) {
    return json({
      success: false,
      error: error?.message || "Request failed."
    }, 500);
  }
}
};
