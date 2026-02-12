import{s as r}from"./index-DoIKaNgo.js";async function c(a){const{data:t,error:e}=await r.from("coach_athletes").select(`
      *,
      athlete:athlete_id (
        id,
        username,
        display_name,
        avatar_url,
        bio,
        user_type,
        is_private,
        created_at
      )
    `).eq("coach_id",a).eq("status","active").order("created_at",{ascending:!1});if(e)throw console.error("Error fetching coach athletes:",e),e;return t.map(i=>({...i,last_workout_date:null}))}function l(){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let t="";for(let e=0;e<8;e++)t+=a.charAt(Math.floor(Math.random()*a.length));return t}async function n(a){const t=l(),{error:e}=await r.from("invite_codes").insert({coach_id:a,code:t});if(e)throw console.error("Error creating invite code:",e),e;return t}async function d(a){const{data:t,error:e}=await r.from("invite_codes").select("code").eq("coach_id",a).eq("is_active",!0).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:!1}).limit(1).maybeSingle();return!e&&t?.code?t.code:await n(a)}async function s(a){const{data:t,error:e}=await r.from("invite_codes").select("coach_id").eq("code",a).eq("is_active",!0).gt("expires_at",new Date().toISOString()).single();return e||!t?(console.error("Error looking up invite code:",e),null):t}async function h(a,t){const e=await s(a);if(!e)throw new Error("Invalid or expired invite code");const{data:o}=await r.from("coach_athletes").select("id").eq("coach_id",e.coach_id).eq("athlete_id",t).maybeSingle();if(o)return;const{error:i}=await r.from("coach_athletes").insert({coach_id:e.coach_id,athlete_id:t,status:"active",invited_via:"link",invite_code:a,started_at:new Date().toISOString()});if(i)throw console.error("Error creating coach-athlete relationship:",i),i}async function _(a,t){const{error:e}=await r.from("coach_athletes").update({status:"inactive",ended_at:new Date().toISOString()}).eq("coach_id",a).eq("athlete_id",t).eq("status","active");if(e)throw console.error("Error removing athlete:",e),e}async function u(a,t){const{data:e,error:o}=await r.from("coach_athletes").select(`
      *,
      athlete:athlete_id (
        id,
        username,
        display_name,
        avatar_url,
        bio,
        user_type,
        is_private,
        created_at
      )
    `).eq("coach_id",a).eq("status","active").or(`athlete.display_name.ilike.%${t}%,athlete.username.ilike.%${t}%`).order("created_at",{ascending:!1});if(o)throw console.error("Error searching athletes:",o),o;return e}const v={async getCoachAthletes(a){return(await c(a)).map(e=>e.athlete)},fetchCoachAthletes:c,getOrCreateInviteCode:d,createInviteCode:n,acceptInviteCode:h,lookupInviteCode:s,removeAthlete:_,searchAthletes:u};export{h as a,v as b,c as f,d as g,s as l};
