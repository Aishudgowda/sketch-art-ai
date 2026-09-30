const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const STYLES = [
  {
    name: "Pencil Portrait",
    prompt: `
Create a premium realistic hand-drawn graphite pencil portrait
from the reference image.

Keep the same person's identity, facial structure, eyes, nose,
lips, hairstyle and proportions.

Use detailed graphite pencil strokes, realistic shading,
fine cross-hatching, natural skin detail and professional
traditional portrait drawing.

Monochrome pencil on clean white paper.
Highly detailed.
Realistic.
No cartoon.
No anime.
No color.
No distorted face.
No extra people.
`
  },

  {
    name: "Ink + Pencil",
    prompt: `
Transform the reference photo into a professional realistic
black ink and graphite pencil portrait.

Preserve the same person's identity and facial features.

Use elegant ink linework combined with detailed pencil shading,
fine cross-hatching, realistic proportions and natural facial
details.

White paper background.
Premium traditional hand-drawn illustration.
Monochrome.
Highly detailed.
No cartoon.
No anime.
No distorted face.
`
  },

  {
    name: "Time Travel Art",
    prompt: `
Create a premium realistic monochrome pencil and ink portrait
using the reference image.

Keep the same person's identity and recognizable facial features.

Add elegant vintage time-travel artistic elements around the
portrait:
a Roman numeral clock, mechanical gears, compass,
subtle airplane motion trails and flowing time lines.

Make the face the main subject.

Detailed graphite shading.
Fine cross-hatching.
Professional hand-drawn artwork.
White paper.
Black and graphite tones only.
No cartoon.
No anime.
No distorted face.
`
  },

  {
    name: "Premium Sketch",
    prompt: `
Create an exceptionally detailed premium realistic pencil sketch
from the reference photo.

Preserve the exact identity and recognizable facial structure.

Use sophisticated fine-line drawing, realistic graphite shading,
deep tonal detail, cross-hatching and professional portrait
illustration techniques.

Add subtle artistic gears, compass and elegant sketch lines
around the subject.

Museum-quality traditional hand-drawn appearance.
White paper.
Monochrome.
Highly detailed.
No cartoon.
No anime.
No color.
No distorted face.
`
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

async function generateSketch(env, photo, prompt) {
  const form = new FormData();

  form.append(
    "input_image_0",
    photo,
    "reference.jpg"
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
    throw new Error("AI did not return an image.");
  }

  return result.image;
}

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);

    // API HOME
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json({
        success: true,
        app: "Sketch Art AI",
        status: "online"
      });
    }

    // GENERATE ENDPOINT TEST
    if (
      request.method === "GET" &&
      url.pathname === "/api/generate"
    ) {
      return json({
        success: false,
        error: "This endpoint requires POST with an image."
      }, 405);
    }

    // GENERATE 4 SKETCHES
    if (
      request.method === "POST" &&
      url.pathname === "/api/generate"
    ) {

      try {

        const formData = await request.formData();

        const photo = formData.get("photo");

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
            error: "Photo must be smaller than 10 MB."
          }, 400);
        }

        const images = [];

        for (const style of STYLES) {

          const generatedImage =
            await generateSketch(
              env,
              photo,
              style.prompt
            );

          images.push({
            name: style.name,
            image:
              "data:image/png;base64," +
              generatedImage
          });
        }

        return json({
          success: true,
          count: images.length,
          images
        });

      } catch (error) {

        return json({
          success: false,
          error:
            error?.message ||
            "Image generation failed."
        }, 500);
      }
    }

    return json({
      success: false,
      error: "Endpoint not found."
    }, 404);
  }
};+
