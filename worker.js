const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const PRICE = 9900;
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
No color, no cartoon, no distorted face.`
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

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  };
}

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json",
      ...corsHeaders()
    }
  });
}

function randomId(){
  return crypto.randomUUID().replaceAll("-","");
}

function bytesToBase64(bytes){
  let binary="";
  const chunk=0x8000;

  for(let i=0;i<bytes.length;i+=chunk){
    binary += String.fromCharCode(
      ...bytes.subarray(i,Math.min(i+chunk,bytes.length))
    );
  }

  return btoa(binary);
}

function base64ToBytes(base64){
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);

  for(let i=0;i<binary.length;i++){
    bytes[i]=binary.charCodeAt(i);
  }

  return bytes;
}

function base64url(bytes){
  let binary="";

  for(const b of bytes){
    binary += String.fromCharCode(b);
  }

  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

function base64urlDecode(text){
  let s=text
    .replace(/-/g,"+")
    .replace(/_/g,"/");

  while(s.length%4) s+="=";

  const binary=atob(s);
  const bytes=new Uint8Array(binary.length);

  for(let i=0;i<binary.length;i++){
    bytes[i]=binary.charCodeAt(i);
  }

  return bytes;
}

async function hmacHex(secret,text){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );

  const signature=await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text)
  );

  return [...new Uint8Array(signature)]
    .map(b=>b.toString(16).padStart(2,"0"))
    .join("");
}

async function createToken(env,payload){
  const body=base64url(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const signature=await hmacHex(
    env.DOWNLOAD_SIGNING_SECRET,
    body
  );

  return body+"."+signature;
}

async function verifyToken(env,token){
  const parts=token.split(".");

  if(parts.length!==2){
    throw new Error("Invalid token.");
  }

  const [body,signature]=parts;

  const expected=await hmacHex(
    env.DOWNLOAD_SIGNING_SECRET,
    body
  );

  if(signature.length!==expected.length){
    throw new Error("Invalid token.");
  }

  let mismatch=0;

  for(let i=0;i<signature.length;i++){
    mismatch |= signature.charCodeAt(i)^expected.charCodeAt(i);
  }

  if(mismatch!==0){
    throw new Error("Invalid token.");
  }

  const payload=JSON.parse(
    new TextDecoder().decode(
      base64urlDecode(body)
    )
  );

  if(!payload.exp || Date.now()>payload.exp){
    throw new Error("Token expired.");
  }

  return payload;
}

async function generateImage(
  env,
  referenceBytes,
  prompt,
  width,
  height
){
  const form=new FormData();

  const referenceBlob=new Blob(
    [referenceBytes],
    {type:"image/jpeg"}
  );

  form.append(
    "input_image_0",
    referenceBlob,
    "reference.jpg"
  );

  form.append("prompt",prompt);
  form.append("width",String(width));
  form.append("height",String(height));
  form.append("guidance","3.5");

  const response=new Response(form);

  const result=await env.AI.run(MODEL,{
    multipart:{
      body:response.body,
      contentType:response.headers.get("content-type")
    }
  });

  if(!result || !result.image){
    throw new Error("AI did not return an image.");
  }

  return base64ToBytes(result.image);
}

async function getSession(env,id){
  const object=await env.FILES.get(`sessions/${id}.json`);

  if(!object){
    throw new Error("Session not found or expired.");
  }

  return await object.json();
}

async function saveSession(env,id,data){
  await env.FILES.put(
    `sessions/${id}.json`,
    JSON.stringify(data),
    {
      httpMetadata:{
        contentType:"application/json"
      }
    }
  );
}

async function createRazorpayOrder(env,receipt){
  const auth=btoa(
    env.RAZORPAY_KEY_ID +
    ":" +
    env.RAZORPAY_KEY_SECRET
  );

  const response=await fetch(
    "https://api.razorpay.com/v1/orders",
    {
      method:"POST",
      headers:{
        "Authorization":"Basic "+auth,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        amount:PRICE,
        currency:CURRENCY,
        receipt:receipt,
        payment_capture:1
      })
    }
  );

  const data=await response.json();

  if(!response.ok){
    throw new Error(
      data?.error?.description ||
      "Razorpay order creation failed."
    );
  }

  return data;
}

async function getRazorpayResource(env,path){
  const auth=btoa(
    env.RAZORPAY_KEY_ID +
    ":" +
    env.RAZORPAY_KEY_SECRET
  );

  const response=await fetch(
    "https://api.razorpay.com/v1/"+path,
    {
      headers:{
        "Authorization":"Basic "+auth
      }
    }
  );

  const data=await response.json();

  if(!response.ok){
    throw new Error(
      data?.error?.description ||
      "Razorpay verification request failed."
    );
  }

  return data;
}

export default {

  async fetch(request,env){

    if(request.method==="OPTIONS"){
      return new Response(null,{
        status:204,
        headers:corsHeaders()
      });
    }

    const url=new URL(request.url);

    if(request.method==="GET" && url.pathname==="/"){
      return json({
        ok:true,
        service:"Sketch Art AI API",
        worldwide:true
      });
    }

    try{

      if(
        request.method==="POST" &&
        url.pathname==="/api/generate"
      ){

        const form=await request.formData();
        const photo=form.get("photo");

        if(!photo || typeof photo==="string"){
          return json({
            success:false,
            error:"Please upload a photo."
          },400);
        }

        if(!photo.type.startsWith("image/")){
          return json({
            success:false,
            error:"Only image files are allowed."
          },400);
        }

        if(photo.size>10*1024*1024){
          return json({
            success:false,
            error:"Image must be smaller than 10 MB."
          },400);
        }

        const referenceBytes=
          new Uint8Array(
            await photo.arrayBuffer()
          );

        const sessionId=randomId();

        await env.FILES.put(
          `references/${sessionId}.jpg`,
          referenceBytes,
          {
            httpMetadata:{
              contentType:"image/jpeg"
            }
          }
        );

        const images=[];

        for(let i=0;i<styles.length;i++){

          const image=await generateImage(
            env,
            referenceBytes,
            styles[i].prompt,
            512,
            682
          );

          const key=
            `previews/${sessionId}/${i}.png`;

          await env.FILES.put(
            key,
            image,
            {
              httpMetadata:{
                contentType:"image/png",
                cacheControl:"private, max-age=300"
              }
            }
          );

          const token=await createToken(env,{
            k:key,
            exp:Date.now()+30*60*1000
          });

          images.push({
            name:styles[i].name,
            url:
              `${url.origin}/api/file?token=`+
              encodeURIComponent(token)
          });
        }

        const session={
          id:sessionId,
          createdAt:Date.now(),
          paid:false,
          orderId:null,
          referenceKey:
            `references/${sessionId}.jpg`,
          previews:styles.map((s,i)=>({
            name:s.name,
            key:`previews/${sessionId}/${i}.png`
          }))
        };

        await saveSession(
          env,
          sessionId,
          session
        );

        return json({
          success:true,
          sessionId,
          images
        });
      }

      if(
        request.method==="POST" &&
        url.pathname==="/api/create-order"
      ){

        const body=await request.json();
        const sessionId=body?.sessionId;

        if(!sessionId){
          return json({
            success:false,
            error:"Session missing."
          },400);
        }

        const session=
          await getSession(env,sessionId);

        if(session.paid){
          return json({
            success:false,
            error:"This session is already paid."
          },400);
        }

        const order=
          await createRazorpayOrder(
            env,
            "sketch_"+sessionId
          );

        session.orderId=order.id;

        await saveSession(
          env,
          sessionId,
          session
        );

        return json({
          success:true,
          orderId:order.id,
          amount:PRICE,
          currency:CURRENCY,
          keyId:env.RAZORPAY_KEY_ID
        });
      }

      if(
        request.method==="POST" &&
        url.pathname==="/api/verify-payment"
      ){

        const body=await request.json();

        const sessionId=
          body?.sessionId;

        const orderId=
          body?.razorpay_order_id;

        const paymentId=
          body?.razorpay_payment_id;

        const razorpaySignature=
          body?.razorpay_signature;

        if(
          !sessionId ||
          !orderId ||
          !paymentId ||
          !razorpaySignature
        ){
          return json({
            success:false,
            error:"Payment information is incomplete."
          },400);
        }

        const session=
          await getSession(env,sessionId);

        if(session.orderId!==orderId){
          return json({
            success:false,
            error:"Order does not match this session."
          },400);
        }

        const expectedSignature=
          await hmacHex(
            env.RAZORPAY_KEY_SECRET,
            orderId+"|"+paymentId
          );

        if(
          razorpaySignature.length !==
          expectedSignature.length
        ){
          return json({
            success:false,
            error:"Invalid payment signature."
          },400);
        }

        let mismatch=0;

        for(
          let i=0;
          i<razorpaySignature.length;
          i++
        ){
          mismatch |=
            razorpaySignature.charCodeAt(i) ^
            expectedSignature.charCodeAt(i);
        }

        if(mismatch!==0){
          return json({
            success:false,
            error:"Payment signature verification failed."
          },400);
        }

        const order=
          await getRazorpayResource(
            env,
            `orders/${orderId}`
          );

        if(
          order.amount!==PRICE ||
          order.currency!==CURRENCY
        ){
          return json({
            success:false,
            error:"Payment amount verification failed."
          },400);
        }

        const payment=
          await getRazorpayResource(
            env,
            `payments/${paymentId}`
          );

        if(payment.order_id!==orderId){
          return json({
            success:false,
            error:"Payment order mismatch."
          },400);
        }

        if(
          payment.amount!==PRICE ||
          payment.currency!==CURRENCY
        ){
          return json({
            success:false,
            error:"Payment amount mismatch."
          },400);
        }

        if(payment.status!=="captured"){
          return json({
            success:false,
            error:
              "Payment is not captured yet."
          },400);
        }

        if(session.paid && session.hd){
          const images=[];

          for(const item of session.hd){
            const token=await createToken(env,{
              k:item.key,
              paid:true,
              exp:Date.now()+24*60*60*1000
            });

            images.push({
              name:item.name,
              url:
                `${url.origin}/api/file?token=`+
                encodeURIComponent(token)
            });
          }

          return json({
            success:true,
            images
          });
        }

        const reference=
          await env.FILES.get(
            session.referenceKey
          );

        if(!reference){
          return json({
            success:false,
            error:"Reference image expired."
          },410);
        }

        const referenceBytes=
          new Uint8Array(
            await reference.arrayBuffer()
          );

        const hd=[];

        for(let i=0;i<styles.length;i++){

          const image=await generateImage(
            env,
            referenceBytes,
            styles[i].prompt,
            1024,
            1365
          );

          const key=
            `hd/${sessionId}/${i}.png`;

          await env.FILES.put(
            key,
            image,
            {
              httpMetadata:{
                contentType:"image/png",
                cacheControl:"private, max-age=86400"
              }
            }
          );

          hd.push({
            name:styles[i].name,
            key:key
          });
        }

        session.paid=true;
        session.paymentId=paymentId;
        session.hd=hd;

        await saveSession(
          env,
          sessionId,
          session
        );

        const images=[];

        for(const item of hd){

          const token=await createToken(env,{
            k:item.key,
            paid:true,
            exp:Date.now()+24*60*60*1000
          });

          images.push({
            name:item.name,
            url:
              `${url.origin}/api/file?token=`+
              encodeURIComponent(token)
          });
        }

        return json({
          success:true,
          images
        });
      }

      if(
        request.method==="GET" &&
        url.pathname==="/api/file"
      ){

        const token=
          url.searchParams.get("token");

        if(!token){
          return new Response(
            "Missing token",
            {
              status:401,
              headers:corsHeaders()
            }
          );
        }

        const payload=
          await verifyToken(
            env,
            token
          );

        const object=
          await env.FILES.get(payload.k);

        if(!object){
          return new Response(
            "File expired or not found",
            {
              status:404,
              headers:corsHeaders()
            }
          );
        }

        const headers=new Headers();

        object.writeHttpMetadata(headers);

        headers.set(
          "Cache-Control",
          "private, no-store"
        );

        headers.set(
          "Access-Control-Allow-Origin",
          "*"
        );

        return new Response(
          object.body,
          {headers}
        );
      }

      return json({
        success:false,
        error:"Endpoint not found."
      },404);

    }catch(error){

      return json({
        success:false,
        error:
          error?.message ||
          "Server error."
      },500);
    }
  }
};
