const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  const formStream = formResponse.body;
  const formContentType = formResponse.headers.get("content-type");

  const result = await env.AI.run(MODEL, {
    multipart: {
      body: formStream,
      contentType: formContentType
    }
  });

  return result.image;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (request.method !== "POST") {
      return json({
        ok: true,
        message: "Sketch Art AI API is running"
      });
    }

    try {
      const form = await request.formData();
      const photo = form.get("photo");

      if (!photo || typeof photo === "string") {
        return json({
          error: "Please upload a photo."
        }, 400);
      }

      if (!photo.type.startsWith("image/")) {
        return json({
          error: "Only image files are allowed."
        }, 400);
      }

      if (photo.size > 10 * 1024 * 1024) {
        return json({
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
};
