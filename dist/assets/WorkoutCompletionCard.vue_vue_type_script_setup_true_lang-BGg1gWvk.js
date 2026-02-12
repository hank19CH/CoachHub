import{s as p,d as C,u as $,m as A,o as f,c as h,a as e,f as b,t as c,w as E,v as F,b as g,g as S,r as v,y as N,h as M,i as W,z as T,q as k,j as V}from"./index-DoIKaNgo.js";import{f as w}from"./formatDistanceToNow-CDssafZe.js";async function be(t,n){const{data:a,error:l}=await p.from("coach_athletes").select("athlete_id").eq("coach_id",t).eq("status","active");if(l)throw l;if(!a||a.length===0)return[];const i=n?.athleteId?[n.athleteId]:a.map(_=>_.athlete_id);let s=p.from("workout_completions").select(`
      *,
      athlete:profiles!workout_completions_athlete_id_fkey(
        id,
        display_name,
        avatar_url,
        username
      ),
      assignment:workout_assignments!workout_completions_assignment_id_fkey(
        *,
        workout:workouts(
          name,
          description
        )
      ),
      exercise_results(
        *,
        exercise:exercises(name)
      )
    `).in("athlete_id",i).order("completed_at",{ascending:!1});n?.startDate&&(s=s.gte("completed_at",n.startDate)),n?.endDate&&(s=s.lte("completed_at",n.endDate)),n?.limit&&(s=s.limit(n.limit));const{data:o,error:d}=await s;if(d)throw d;return o||[]}async function we(t,n,a=30){const{data:l}=await p.from("coach_athletes").select("id").eq("coach_id",n).eq("athlete_id",t).eq("status","active").single();if(!l)throw new Error("No active coach-athlete relationship");const{data:i,error:s}=await p.from("workout_completions").select(`
      *,
      athlete:profiles!workout_completions_athlete_id_fkey(
        id,
        display_name,
        avatar_url,
        username
      ),
      assignment:workout_assignments!workout_completions_assignment_id_fkey(
        *,
        workout:workouts(*)
      ),
      exercise_results(
        *,
        exercise:exercises(*)
      )
    `).eq("athlete_id",t).order("completed_at",{ascending:!1}).limit(a);if(s)throw s;return i||[]}async function ye(t,n,a){const{data:l,error:i}=await p.from("workout_assignments").select("id, status, assigned_date").eq("athlete_id",t).eq("coach_id",n).gte("assigned_date",a.start).lte("assigned_date",a.end).order("assigned_date",{ascending:!0});if(i)throw i;const s=l?.length||0,o=l?.filter(m=>m.status==="completed").length||0,d=s>0?o/s*100:0;let _=0;if(l&&l.length>0){const m=[...l].reverse();for(const x of m)if(x.status==="completed")_++;else break}return{totalAssigned:s,totalCompleted:o,complianceRate:Math.round(d),currentStreak:_,missedWorkouts:s-o}}async function j(t,n,a){const{data:l,error:i}=await p.from("workout_completions").select("athlete_id").eq("id",t).single();if(i)throw i;const{data:s}=await p.from("coach_athletes").select("id").eq("coach_id",a).eq("athlete_id",l.athlete_id).eq("status","active").single();if(!s)throw new Error("Unauthorized to provide feedback on this workout");const{data:o,error:d}=await p.from("workout_completions").update({coach_feedback:n,feedback_at:new Date().toISOString()}).eq("id",t).select().single();if(d)throw d;return o}async function Ce(t,n,a=12){const{data:l}=await p.from("coach_athletes").select("id").eq("coach_id",n).eq("athlete_id",t).eq("status","active").single();if(!l)throw new Error("No active coach-athlete relationship");const i=new Date;i.setDate(i.getDate()-a*7);const{data:s,error:o}=await p.from("workout_completions").select(`
      completed_at,
      duration_minutes,
      overall_rpe,
      has_pb,
      exercise_results(
        sets_completed,
        reps_completed,
        weight_used_kg,
        distance_meters,
        is_pb
      )
    `).eq("athlete_id",t).gte("completed_at",i.toISOString()).order("completed_at",{ascending:!0});if(o)throw o;return s||[]}const B={class:"flex items-center justify-between p-6 border-b border-gray-200"},z=["disabled"],P={class:"px-6 py-4 bg-gray-50 space-y-1"},U={class:"text-sm text-gray-600"},H={class:"text-sm text-gray-600"},I={class:"p-6"},R=["disabled"],G={class:"text-right text-sm text-gray-500 mt-1"},L={key:0,class:"mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm"},O={class:"flex gap-3 p-6 border-t border-gray-200"},X=["disabled"],J=["disabled"],y=500,K=C({__name:"FeedbackModal",props:{completion:{}},emits:["close","feedback-added"],setup(t,{emit:n}){const a=t,l=n,i=$(),s=v(""),o=v(!1),d=v(null);A(()=>{a.completion.coach_feedback&&(s.value=a.completion.coach_feedback)});async function _(){if(!s.value.trim()){d.value="Feedback cannot be empty";return}o.value=!0,d.value=null;try{await j(a.completion.id,s.value.trim(),i.user.id),l("feedback-added")}catch(x){console.error("Error saving feedback:",x),d.value=x.message||"Failed to save feedback"}finally{o.value=!1}}function m(){o.value||l("close")}return(x,u)=>(f(),h("div",{class:"fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4",onClick:m},[e("div",{class:"bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto",onClick:u[1]||(u[1]=S(()=>{},["stop"]))},[e("div",B,[u[3]||(u[3]=e("h2",{class:"text-xl font-bold text-gray-900"},"Provide Feedback",-1)),e("button",{onClick:m,class:"text-gray-400 hover:text-gray-600",disabled:o.value},[...u[2]||(u[2]=[e("svg",{class:"w-6 h-6",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24"},[e("path",{"stroke-linecap":"round","stroke-linejoin":"round","stroke-width":"2",d:"M6 18L18 6M6 6l12 12"})],-1)])],8,z)]),e("div",P,[e("p",U,[u[4]||(u[4]=e("span",{class:"font-semibold"},"Workout:",-1)),b(" "+c(t.completion.assignment?.workout?.name||"Workout"),1)]),e("p",H,[u[5]||(u[5]=e("span",{class:"font-semibold"},"Athlete:",-1)),b(" "+c(t.completion.athlete?.display_name||"Athlete"),1)])]),e("div",I,[E(e("textarea",{"onUpdate:modelValue":u[0]||(u[0]=r=>s.value=r),maxlength:y,rows:"6",placeholder:"Great work today! Here's what I noticed...",class:"input resize-none",disabled:o.value},null,8,R),[[F,s.value]]),e("div",G,c(s.value.length)+" / "+c(y),1)]),d.value?(f(),h("div",L,c(d.value),1)):g("",!0),e("div",O,[e("button",{onClick:m,class:"btn-secondary flex-1",disabled:o.value}," Cancel ",8,X),e("button",{onClick:_,class:"btn-primary flex-1",disabled:o.value||!s.value.trim()},c(o.value?"Saving...":(t.completion.coach_feedback?"Update":"Save")+" Feedback"),9,J)])])]))}}),Q={class:"card p-4 space-y-4"},Y={class:"flex items-start justify-between"},Z={class:"flex items-center gap-3"},ee=["src","alt"],te={class:"font-semibold text-gray-900"},se={class:"text-sm text-gray-600"},ae={class:"text-xs text-gray-500 whitespace-nowrap ml-2"},oe={class:"flex gap-4 flex-wrap"},ne={key:0,class:"flex flex-col"},ie={class:"text-sm font-semibold text-gray-900"},le={class:"flex flex-col"},re={class:"text-sm font-semibold text-gray-900"},ce={key:1,class:"flex flex-col"},de={class:"text-sm font-semibold text-peak-600"},ue={key:2,class:"flex flex-col"},me={class:"text-sm font-semibold text-gray-900"},pe={key:0,class:"bg-summit-50 rounded-xl p-3"},fe={class:"flex items-start gap-2"},_e={class:"flex-1"},he={class:"text-sm text-gray-700"},xe={key:0,class:"text-xs text-gray-500 mt-1"},ge={class:"flex gap-2 pt-2 border-t border-gray-100"},qe=C({__name:"WorkoutCompletionCard",props:{completion:{}},emits:["feedback-added"],setup(t,{emit:n}){const a=t,l=n,i=v(!1),s=k(()=>a.completion.assignment?.workout?.name||"Workout"),o=k(()=>a.completion.athlete?.display_name||"Unknown Athlete"),d=k(()=>w(new Date(a.completion.completed_at),{addSuffix:!0})),_=k(()=>a.completion.exercise_results?.length||0),m=k(()=>a.completion.exercise_results?.filter(u=>u.is_pb).length||0);function x(){i.value=!1,l("feedback-added")}return(u,r)=>{const q=V("router-link");return f(),h("div",Q,[e("div",Y,[e("div",Z,[e("img",{src:t.completion.athlete?.avatar_url||"/default-avatar.png",alt:o.value,class:"avatar-md ring-2 ring-white shadow-sm"},null,8,ee),e("div",null,[e("h3",te,c(o.value),1),e("p",se,c(s.value),1)])]),e("span",ae,c(d.value),1)]),e("div",oe,[t.completion.duration_minutes?(f(),h("div",ne,[r[2]||(r[2]=e("span",{class:"text-xs text-gray-500 uppercase"},"Duration",-1)),e("span",ie,c(t.completion.duration_minutes)+" min",1)])):g("",!0),e("div",le,[r[3]||(r[3]=e("span",{class:"text-xs text-gray-500 uppercase"},"Exercises",-1)),e("span",re,c(_.value),1)]),m.value>0?(f(),h("div",ce,[r[4]||(r[4]=e("span",{class:"text-xs text-gray-500 uppercase"},"PRs",-1)),e("span",de,"🏆 "+c(m.value),1)])):g("",!0),t.completion.overall_rpe?(f(),h("div",ue,[r[5]||(r[5]=e("span",{class:"text-xs text-gray-500 uppercase"},"RPE",-1)),e("span",me,c(t.completion.overall_rpe)+"/10",1)])):g("",!0)]),t.completion.coach_feedback?(f(),h("div",pe,[e("div",fe,[r[6]||(r[6]=e("span",{class:"text-summit-700 text-sm"},"💬",-1)),e("div",_e,[e("p",he,c(t.completion.coach_feedback),1),t.completion.feedback_at?(f(),h("p",xe,c(N(w)(new Date(t.completion.feedback_at),{addSuffix:!0})),1)):g("",!0)])])])):g("",!0),e("div",ge,[M(q,{to:`/coach/athletes/${t.completion.athlete_id}`,class:"btn-secondary btn-sm flex-1 text-center"},{default:W(()=>[...r[7]||(r[7]=[b(" View Details ",-1)])]),_:1},8,["to"]),e("button",{onClick:r[0]||(r[0]=D=>i.value=!0),class:"btn-primary btn-sm flex-1"},c(t.completion.coach_feedback?"Edit Feedback":"Add Feedback"),1)]),i.value?(f(),T(K,{key:1,completion:t.completion,onClose:r[1]||(r[1]=D=>i.value=!1),onFeedbackAdded:x},null,8,["completion"])):g("",!0)])}}});export{qe as _,Ce as a,we as b,ye as c,be as g};
