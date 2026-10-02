const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const PRICE = 9900; // ₹99
const CURRENCY = "INR";

const styles = [
  {
    name: "Pencil Portrait",
    prompt:
      "Create a highly detailed professional hand-drawn pencil portrait from the reference photo. Preserve the exact identity, facial structure, eyes, nose, lips, hairstyle and proportions of the same person. Use realistic graphite pencil strokes, fine linework, natural shading, cross-hatching and subtle paper texture. This must look like an authentic professional artist's pencil portrait, not a basic edge filter. Clean white background, highly detailed face, realistic human proportions."
  },
  {
    name: "Ink + Pencil",
    prompt:
      "Transform the reference photo into a premium realistic ink and pencil sketch. Preserve the exact same person's identity and facial features. Use fine black ink outlines combined with realistic graphite shading, cross-hatching and detailed hand-drawn strokes. Professional portrait-art quality, natural shadows, accurate proportions, clean paper background. Do not make it look like a cartoon or simple photo filter."
  },
  {
    name: "Time Travel Art",
    prompt:
      "Create a premium realistic hand-drawn time-travel pencil artwork using the reference photo. Preserve the exact identity and facial features of the same person. Create detailed graphite and ink sketch work with realistic shading and cross-hatching. Add tasteful artistic time-travel elements around the portrait such as a vintage clock, subtle gears, airplane silhouette, compass and motion lines. The person's face must remain the main focus and highly recognizable. Professional detailed concept-art quality, white paper background."
  },
  {
    name: "Premium Sketch",
    prompt:
      "Create an ultra-detailed premium professional pencil and ink portrait from the reference photo. Keep the exact same person's identity, face shape, eyes, nose, lips, hair and proportions. Use sophisticated graphite shading, fine artistic linework, cross-hatching and realistic hand-drawn texture. Make it look like an expensive commissioned portrait created by a professional artist. Highly realistic, elegant, detailed and clean. No cartoon effect and no simple edge detection."
  }
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function hmacSHA256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        Math.min(i + chunkSize, bytes.length)
      )
    );
  }

  return btoa(binary);
}

async function razorpayRequest(env, path, options = {}) {
  if (
    !env.RAZORPAY_KEY_ID ||
    !env.RAZORPAY_KEY_SECRET
  ) {
    throw new Error("Razorpay is not configured");
  }

  const credentials = btoa(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
  );

  const response = await fetch(
    `https://api.razorpay.com/v1${path}`,
    {
      ...options,
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
        data?.error?.code ||
        "Razorpay request failed"
    );
  }

  return data;
}

async function generateSketch(
  env,
  photoFile,
  styleIndex
) {
  const style = styles[styleIndex];

  if (!style) {
    throw new Error("Invalid sketch style");
  }

  if (!photoFile) {
    throw new Error("Photo is missing");
  }

  const photoBytes = new Uint8Array(
    await photoFile.arrayBuffer()
  );

  if (!photoBytes.length) {
    throw new Error("Photo is empty");
  }

  const mime =
    photoFile.type || "image/jpeg";

  const form = new FormData();

  form.append(
    "prompt",
    style.prompt
  );

  form.append(
    "input_image_0",
    new Blob(
      [photoBytes],
      {
        type: mime
      }
    ),
    "reference.jpg"
  );

  form.append("width", "1024");
  form.append("height", "1024");
  form.append("guidance", "4");

  const formResponse =
    new Response(form);

  const result = await env.AI.run(
    MODEL,
    {
      multipart: {
        body: formResponse.body,
        contentType:
          formResponse.headers.get(
            "content-type"
          )
      }
    }
  );

  if (
    result &&
    typeof result.image === "string"
  ) {
    return result.image.startsWith("data:")
      ? result.image
      : `data:image/png;base64,${result.image}`;
  }

  if (result instanceof Uint8Array) {
    return (
      "data:image/png;base64," +
      bytesToBase64(result)
    );
  }

  if (result instanceof ArrayBuffer) {
    return (
      "data:image/png;base64," +
      bytesToBase64(
        new Uint8Array(result)
      )
    );
  }

  if (result instanceof ReadableStream) {
    const buffer =
      await new Response(result)
        .arrayBuffer();

    return (
      "data:image/png;base64," +
      bytesToBase64(
        new Uint8Array(buffer)
      )
    );
  }

  throw new Error(
    "AI returned an unexpected image response"
  );
}

async function createOrder(
  env,
  sessionId,
  photoHash
) {
  const cleanSession =
    String(sessionId || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 32);

  if (!cleanSession) {
    throw new Error("Invalid session");
  }

  const cleanHash =
    String(photoHash || "")
      .replace(/[^a-fA-F0-9]/g, "")
      .slice(0, 64);

  if (!cleanHash) {
    throw new Error("Invalid photo hash");
  }

  const order =
    await razorpayRequest(
      env,
      "/orders",
      {
        method: "POST",
        body: JSON.stringify({
          amount: PRICE,
          currency: CURRENCY,
          receipt: `sk_${cleanSession}`,
          notes: {
            product:
              "Sketch Art AI HD Download",
            session_id:
              cleanSession,
            photo_hash:
              cleanHash
          }
        })
      }
    );

  return order;
}

async function verifyPayment(
  env,
  formData
) {
  const razorpayOrderId =
    formData.get(
      "razorpay_order_id"
    );

  const razorpayPaymentId =
    formData.get(
      "razorpay_payment_id"
    );

  const razorpaySignature =
    formData.get(
      "razorpay_signature"
    );

  const sessionId =
    formData.get("sessionId");

  const photoHash =
    formData.get("photoHash");

  const photo =
    formData.get("photo");

  const style =
    formData.get("style");

  if (
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature ||
    !sessionId ||
    !photoHash ||
    !photo
  ) {
    throw new Error(
      "Payment verification data is incomplete"
    );
  }

  if (!(photo instanceof File)) {
    throw new Error("Invalid photo");
  }

  const expectedSignature =
    await hmacSHA256(
      env.RAZORPAY_KEY_SECRET,
      `${razorpayOrderId}|${razorpayPaymentId}`
    );

  if (
    !safeEqual(
      expectedSignature,
      String(razorpaySignature)
    )
  ) {
    throw new Error(
      "Invalid payment signature"
    );
  }

  const order =
    await razorpayRequest(
      env,
      `/orders/${encodeURIComponent(
        razorpayOrderId
      )}`
    );

  if (!order) {
    throw new Error("Order not found");
  }

  if (Number(order.amount) !== PRICE) {
    throw new Error(
      "Invalid payment amount"
    );
  }

  if (
    String(order.currency) !==
    CURRENCY
  ) {
    throw new Error(
      "Invalid payment currency"
    );
  }

  const payment =
    await razorpayRequest(
      env,
      `/payments/${encodeURIComponent(
        razorpayPaymentId
      )}`
    );

  if (!payment) {
    throw new Error(
      "Payment not found"
    );
  }

  if (
    String(payment.order_id) !==
    String(razorpayOrderId)
  ) {
    throw new Error(
      "Payment does not belong to this order"
    );
  }

  if (
    String(payment.status) !==
    "captured"
  )
