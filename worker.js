const MODEL="@cf/black-forest-labs/flux-2-klein-4b";
const PRICE=9900,CURRENCY="INR";

const STYLES=[
"Pencil portrait, realistic hand-drawn graphite sketch, preserve the exact person's identity, face shape, eyes, nose, lips and hairstyle, detailed shading and cross-hatching, white paper, monochrome, professional drawing, no cartoon, no color.",
"Realistic ink and pencil portrait, preserve the exact person's identity and facial features, fine black ink lines with graphite shading, detailed cross-hatching, white paper, monochrome, professional illustration, no cartoon, no color.",
"Realistic pencil time-travel portrait, preserve the exact person's identity and facial features, graphite and ink drawing with elegant clock, gears, vintage airplane and subtle time-travel lines around the portrait, white paper, monochrome, no cartoon.",
"Premium realistic graphite and ink portrait, preserve the exact person's identity and facial structure, very fine pencil strokes, detailed shading, cross-hatching, subtle clock and gears, clean white paper, professional traditional sketch, monochrome."
];

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type"
};

const out=(x,s=200)=>new Response(JSON.stringify(x),{
  status:s,
  headers:{"Content-Type":"application/json",...CORS}
});

const clean=(x,n=64)=>String(x||"")
  .replace(/[^a-zA-Z0-9]/g,"")
  .slice(0,n);

async function hash(b){
  return [...new Uint8Array(
    await crypto.subtle.digest("SHA-256",b)
  )].map(x=>x.toString(16).padStart(2,"0")).join("")
}

async function rp(env,path,opt={}){
  if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)
    throw Error("Razorpay is not configured");

  const auth=btoa(
    env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET
  );

  const r=await fetch(
    "https://api.razorpay.com/v1/"+path,
    {
      method:opt.method||"GET",
      headers:{
        Authorization:"Basic "+auth,
        "Content-Type":"application/json"
      },
      body:opt.body?JSON.stringify(opt.body):undefined
    }
  );

  const d=await r.json().catch(()=>({}));

  if(!r.ok)
    throw Error(
      d?.error?.description||
      "Razorpay request failed"
    );

  return d;
}

async function sign(env,s){
  const k=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.RAZORPAY_KEY_SECRET),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );

  return [...new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      k,
      new TextEncoder().encode(s)
    )
  )].map(x=>x.toString(16).padStart(2,"0")).join("");
}

async function ai(env,bytes,prompt,w,h){

  const f=new FormData();

  f.append("prompt",prompt);

  f.append(
    "input_image_0",
    new Blob([bytes],{type:"image/jpeg"}),
    "reference.jpg"
  );

  f.append("width",String(w));
  f.append("height",String(h));
  f.append("guidance","3.5");

  const m=new Response(f);

  const r=await env.AI.run(
    MODEL,
    {
      multipart:{
        body:m.body,
        contentType:m.headers.get("content-type")
      }
    }
  );

  if(typeof r?.image==="string")
    return r.image.startsWith("data:")
      ? r.image
      : "data:image/png;base64,"+r.image;

  if(r instanceof Uint8Array)
    return "data:image/png;base64,"+
      btoa(String.fromCharCode(...r));

  if(r instanceof ArrayBuffer)
    return "data:image/png;base64,"+
      btoa(String.fromCharCode(
        ...new Uint8Array(r)
      ));

  if(r instanceof ReadableStream){
    const b=new Uint8Array(
      await new Response(r).arrayBuffer()
    );

    return "data:image/png;base64,"+
      btoa(String.fromCharCode(...b));
  }

  throw Error(
    "Workers AI did not return an image"
  );
}

async function all(env,b,w,h){
  const results = [];

  for (const p of STYLES) {
    results.push(await ai(env,b,p,w,h));
  }

  return results;
}

export default{
  async fetch(request,env){

    if(request.method==="OPTIONS")
      return new Response(null,{
        status:204,
        headers:CORS
      });

    const u=new URL(request.url);

    try{

      if(
        request.method==="GET" &&
        u.pathname==="/"
      )
        return out({
          success:true,
          service:"Sketch Art AI"
        });

      if(
        request.method==="POST" &&
        u.pathname==="/api/generate"
      ){

        const f=await request.formData();
        const photo=f.get("photo");

        if(!photo||typeof photo==="string")
          return out({
            success:false,
            error:"Please upload a photo"
          },400);

        const b=new Uint8Array(
          await photo.arrayBuffer()
        );

        if(!b.length)
          return out({
            success:false,
            error:"Photo is empty"
          },400);

        const photoHash=await hash(b);

        const images=await all(
          env,b,512,682
        );

        return out({
          success:true,
          sessionId:crypto.randomUUID(),
          photoHash,
          images
        });
      }

      if(
        request.method==="POST" &&
        u.pathname==="/api/create-order"
      ){

        const b=await request.json();

        if(!b.sessionId||!b.photoHash)
          return out({
            success:false,
            error:"Session information missing"
          },400);

        const order=await rp(
          env,
          "orders",
          {
            method:"POST",
            body:{
              amount:PRICE,
              currency:CURRENCY,
              receipt:"sk_"+clean(
                b.sessionId,32
              ),
              notes:{
                sessionId:String(
                  b.sessionId
                ),
                photoHash:String(
                  b.photoHash
                )
              }
            }
          }
        );

        return out({
          success:true,
          keyId:env.RAZORPAY_KEY_ID,
          orderId:order.id,
          amount:PRICE,
          currency:CURRENCY
        });
      }

      if(
        request.method==="POST" &&
        u.pathname==="/api/verify-payment"
      ){

        const f=await request.formData();

        const sid=f.get("sessionId");
        const ph=f.get("photoHash");
        const oid=f.get("razorpay_order_id");
        const pid=f.get("razorpay_payment_id");
        const sig=f.get("razorpay_signature");
        const photo=f.get("photo");

        if(
          !sid||!ph||!oid||!pid||
          !sig||!photo||
          typeof photo==="string"
        )
          return out({
            success:false,
            error:"Payment information is incomplete"
          },400);

        const b=new Uint8Array(
          await photo.arrayBuffer()
        );

        if(await hash(b)!==String(ph))
          return out({
            success:false,
            error:"Photo verification failed"
          },400);

        if(
          sig!==await sign(
            env,
            String(oid)+"|"+String(pid)
          )
        )
          return out({
            success:false,
            error:"Invalid payment signature"
          },400);

        const order=await rp(
          env,
          "orders/"+encodeURIComponent(oid)
        );

        if(
          order.amount!==PRICE||
          order.currency!==CURRENCY||
          String(order.notes?.sessionId)!==String(sid)||
          String(order.notes?.photoHash)!==String(ph)
        )
          return out({
            success:false,
            error:"Payment verification failed"
          },400);

        const pay=await rp(
          env,
          "payments/"+encodeURIComponent(pid)
        );

        if(
          pay.order_id!==oid||
          pay.amount!==PRICE||
          pay.currency!==CURRENCY||
          pay.status!=="captured"
        )
          return out({
            success:false,
            error:"Payment has not been captured"
          },400);

        return out({
          success:true,
          images:await all(
            env,b,1024,1365
          )
        });
      }

      return out({
        success:false,
        error:"Endpoint not found"
      },404);

    }catch(e){

      return out({
        success:false,
        error:e?.message||
          "Server error"
      },500);
    }
  }
};
