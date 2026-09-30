const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const STYLES = [
  [
    "Pencil Portrait",
    "Create a premium realistic graphite pencil portrait from the reference photo. Preserve the same person's identity, face, eyes, nose, lips, hairstyle and proportions. Detailed pencil strokes, realistic shading, fine cross-hatching, white paper, monochrome, professional hand-drawn portrait. No cartoon, no anime, no distortion, no extra people."
  ],
  [
    "Ink + Pencil",
    "Create a realistic black ink and graphite pencil portrait from the reference photo. Preserve the same identity and facial features. Elegant ink linework, detailed pencil shading, fine cross-hatching, realistic proportions, white paper, monochrome, premium traditional illustration. No cartoon, no anime, no distortion."
  ],
  [
    "Time Travel Art",
    "Create a premium realistic monochrome pencil and ink portrait from the reference photo. Preserve the same identity and recognizable facial features. Add a Roman numeral clock, mechanical gears, compass, subtle airplane motion trails and elegant time lines around the portrait. Detailed graphite shading, fine cross-hatching, white paper. No cartoon, no anime, no distortion."
  ],
  [
    "Premium Sketch",
    "Create an exceptionally detailed realistic pencil sketch from the reference photo. Preserve the exact identity and facial structure. Sophisticated fine-line drawing, realistic graphite shading, deep tonal detail and cross-hatching. Add subtle gears, compass and elegant sketch lines. White paper, monochrome, premium hand-drawn appearance. No cartoon, no anime, no color, no distortion."
  ]
];

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors()
    }
  });
}

async function generateImage(env, photo, prompt) {
  const form = new FormData();

  form.append("input_image_0", photo, "reference.jpg");
  form.append("prompt", prompt);
  form.append("width", "768");
  form.append("height", "1024");
  form.append("guidance", "3.5");

  const response = new Response(form);

  const result = await env.AI.run(MODEL, {
    multipart: {
      body: response.body,
      contentType: response.headers.get("content-type")
    }
  });

  if (!result || !result.image) {
    throw new Error("AI did not return an image.");
  }

  return "data:image/png;base64," + result.image;
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
      return reply({
        success: true,
        app: "Sketch Art AI",
        status: "online"
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/generate"
    ) {
      return reply({
        success: false,
        error: "Send a POST request with an image."
      }, 405);
    }

    if (
      request.method !== "POST" ||
      url.pathname !== "/api/generate"
    ) {
      return reply({
        success: false,
        error: "Endpoint not found."
      }, 404);
    }

    try {
      const formData = await request.formData();
      const photo = formData.get("photo");

      if (!photo || typeof photo === "string") {
        return reply({
          success: false,
          error: "Please upload a photo."
        }, 400);
      }

      if (
        !photo.type ||
        !photo.type.startsWith("image/")
      ) {
        return reply({
          success: false,
          error: "Only image files are allowed."
        }, 400);
      }

      if (photo.size > 10 * 1024 * 1024) {
        return reply({
          success: false,
          error: "Photo must be smaller than 10 MB."
        }, 400);
      }

      const images = [];

      for (const style of STYLES) {
        const image = await generateImage(
          env,
          photo,
          style[1]
        );

        images.push({
          name: style[0],
          image: image
        });
      }

      return reply({
        success: true,
        count: images.length,
        images: images
      });

    } catch (error) {
      return reply({
        success: false,
        error: error && error.message
          ? error.message
          : "Image generation failed."
      }, 500);
    }
  }
};
