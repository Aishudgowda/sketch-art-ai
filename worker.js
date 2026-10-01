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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS
    }
  });
}

function bytesToBase64(bytes) {
  let binary = "";

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + 0x8000)
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
    .map(
      byte => byte.toString(16).padStart(2, "0")
    )
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

async function hmacHex(secret, text) {
  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(text)
    )
  );
}

async function razorpay(
  path,
  env,
  method = "GET",
  body
) {
  const auth = btoa(
    env.RAZORPAY_KEY_ID +
    ":" +
    env.RAZORPAY_KEY_SECRET
  );

  const response = await fetch(
    "https://api.razorpay.com/v1/" + path,
    {
      method,

      headers: {
        "Authorization":
          "Basic " + auth,

        "Content-Type":
          "application/json"
      },

      body: body
        ? JSON.stringify(body)
        : undefined
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
      "Razorpay request failed."
    );
  }

  return data;
}

async function generate(
  env,
  bytes,
  styleIndex,
  width,
  height
) {
  const style =
    styles[styleIndex];

  if (!style) {
    throw new Error(
      "Invalid sketch style."
    );
  }

  const form =
    new FormData();

  form.append(
    "input_image_0",
    new Blob(
      [bytes],
      { type: "image/jpeg" }
    ),
    "reference.jpg"
  );

  form.append(
    "prompt",
    style.prompt
  );

  form.append(
    "width",
    String(width)
  );

  form.append(
    "height",
    String(height)
  );

  form.append(
    "guidance",
    "3.5"
  );

  const request =
    new Response(form);

  const result =
    await env.AI.run(
      MODEL,
      {
        multipart: {
          body: request.body,

          contentType:
            request.headers.get(
              "content-type"
            )
        }
      }
    );

  if (!result?.image) {
    throw new Error(
      "AI image generation failed."
    );
  }

  return {
    name: style.name,

    image:
      "data:image/png;base64," +
      bytesToBase64(
        base64ToBytes(
          result.image
        )
      )
  };
}

async function getPhoto(form) {
  const photo =
    form.get("photo");

  if (
    !photo ||
    typeof photo === "string"
  ) {
    throw new Error(
      "Please upload a photo."
    );
  }

  if (
    !photo.type.startsWith(
      "image/"
    )
  ) {
    throw new Error(
      "Only image files are allowed."
    );
  }

  if (
    photo.size >
    10 * 1024 * 1024
  ) {
    throw new Error(
      "Image must be smaller than 10 MB."
    );
  }

  return new Uint8Array(
    await photo.arrayBuffer()
  );
}

async function verifyPayment(
  env,
  form,
  bytes
) {
  const sessionId =
    String(
      form.get("sessionId") || ""
    );

  const photoHash =
    String(
      form.get("photoHash") || ""
    );

  const orderId =
    String(
      form.get(
        "razorpay_order_id"
      ) || ""
    );

  const paymentId =
    String(
      form.get(
        "razorpay_payment_id"
      ) || ""
    );

  const signature =
    String(
      form.get(
        "razorpay_signature"
      ) || ""
    );

  if (
    !sessionId ||
    !photoHash ||
    !orderId ||
    !paymentId ||
    !signature
  ) {
    throw new Error(
      "Payment information is incomplete."
    );
  }

  const actualHash =
    await sha256(bytes);

  if (
    actualHash !== photoHash
  ) {
    throw new Error(
      "Photo verification failed."
    );
  }

  const expected =
    await hmacHex(
      env.RAZORPAY_KEY_SECRET,
      orderId +
      "|" +
      paymentId
    );

  if (
    signature !== expected
  ) {
    throw new Error(
      "Invalid payment signature."
    );
  }

  const order =
    await razorpay(
      "orders/" + orderId,
      env
    );

  if (
    order.amount !== PRICE ||
    order.currency !== CURRENCY
  ) {
    throw new Error(
      "Payment amount verification failed."
    );
  }

  if (
    order.notes?.sessionId !==
      sessionId ||
    order.notes?.photoHash !==
      photoHash
  ) {
    throw new Error(
      "Payment session mismatch."
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
    throw new Error(
      "Payment has not been successfully captured."
    );
  }
}

export default {
  async fetch(request, env) {

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: CORS
        }
      );
    }

    const url =
      new URL(request.url);

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json({
        ok: true,
        service:
          "Sketch Art AI",
        worldwide: true
      });
    }

    try {

      /* CONFIG */

      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/config"
      ) {
        return json({
          success: true,
          keyId:
            env.RAZORPAY_KEY_ID
        });
      }


      /*
        ONE PREVIEW REQUEST
        Frontend will send 4 separate
        requests in parallel.
      */

      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/generate-one"
      ) {

        const form =
          await request.formData();

        const styleIndex =
          Number(
            form.get("style")
          );

        if (
          !Number.isInteger(
            styleIndex
          ) ||
          styleIndex < 0 ||
          styleIndex > 3
        ) {
          return json(
            {
              success: false,
              error:
                "Invalid sketch style."
            },
            400
          );
        }

        const bytes =
          await getPhoto(form);

        const photoHash =
          await sha256(bytes);

        const result =
          await generate(
            env,
            bytes,
            styleIndex,
            512,
            682
          );

        return json({
          success: true,

          sessionId:
            String(
              form.get(
                "sessionId"
              ) ||
              crypto.randomUUID()
            ),

          photoHash,

          ...result
        });
      }


      /*
        RAZORPAY ORDER
      */

      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/create-order"
      ) {

        const body =
          await request.json();

        if (
          !body.sessionId ||
          !body.photoHash
        ) {
          return json(
            {
              success: false,
              error:
                "Session information missing."
            },
            400
          );
        }

        const cleanSession =
          String(
            body.sessionId
          ).replace(
            /[^a-zA-Z0-9]/g,
            ""
          );

        const receipt =
          "sk_" +
          cleanSession.slice(
            0,
            32
          );

        const order =
          await razorpay(
            "orders",
            env,
            "POST",
            {
              amount: PRICE,

              currency:
                CURRENCY,

              receipt,

              notes: {
                sessionId:
                  body.sessionId,

                photoHash:
                  body.photoHash
              }
            }
          );

        return json({
          success: true,

          orderId:
            order.id,

          amount:
            PRICE,

          currency:
            CURRENCY,

          keyId:
            env.RAZORPAY_KEY_ID
        });
      }


      /*
        ONE HD REQUEST
        Frontend will send 4 separate
        requests in parallel after payment.
      */

      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/verify-payment-one"
      ) {

        const form =
          await request.formData();

        const styleIndex =
          Number(
            form.get("style")
          );

        if (
          !Number.isInteger(
            styleIndex
          ) ||
          styleIndex < 0 ||
          styleIndex > 3
        ) {
          return json(
            {
              success: false,
              error:
                "Invalid sketch style."
            },
            400
          );
        }

        const bytes =
          await getPhoto(form);

        await verifyPayment(
          env,
          form,
          bytes
        );

        const result =
          await generate(
            env,
            bytes,
            styleIndex,
            1024,
            1365
          );

        return json({
          success: true,
          ...result
        });
      }


      return json(
        {
          success: false,
          error:
            "Endpoint not found."
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
