import{s as n}from"./index-DoIKaNgo.js";import{u as g,g as m}from"./streaks-3FQZ5a9Q.js";import{S as l,b as w,d as h}from"./posts-TMv8HSpT.js";async function E(s,r,t){try{const{data:e,error:o}=await n.from("workout_completions").insert({assignment_id:s,athlete_id:r,completed_at:new Date().toISOString(),duration_minutes:t.durationMinutes,athlete_notes:t.athleteNotes,overall_rpe:t.overallRpe,has_pb:t.exerciseResults.some(d=>d.is_pb),caption:null,shared_exercise_ids:[],share_settings:{}}).select("id").single();if(o)throw o;if(t.exerciseResults.length>0){const d=t.exerciseResults.map(c=>({completion_id:e.id,exercise_id:c.exercise_id,sets_completed:c.sets_completed,reps_completed:c.reps_completed,weight_used_kg:c.weight_used_kg,duration_seconds:c.duration_seconds,distance_meters:c.distance_meters,rpe:c.rpe,is_pb:c.is_pb,notes:c.notes})),{error:u}=await n.from("exercise_results").insert(d);if(u)throw u}const{error:a}=await n.from("workout_assignments").update({status:"completed"}).eq("id",s);if(a)throw a;const i=t.exerciseResults.filter(d=>d.is_pb);i.length>0&&await p(r,i,e.id),await g(r);try{const d=await m(r);d&&l.includes(d.current_streak)&&await w(r,d.current_streak)}catch{}return{success:!0,completionId:e.id}}catch(e){return console.error("Error completing workout:",e),{success:!1,error:e.message}}}async function p(s,r,t){try{for(const e of r){const{data:o}=await n.from("exercises").select("name").eq("id",e.exercise_id).single();if(!o)continue;let a=null,i=null;e.weight_used_kg&&e.weight_used_kg>0?(a="weight",i=e.weight_used_kg):e.reps_completed?(a="reps",i=parseInt(e.reps_completed)):e.duration_seconds&&e.duration_seconds>0?(a="time",i=e.duration_seconds):e.distance_meters&&e.distance_meters>0&&(a="distance",i=e.distance_meters),a&&i&&!isNaN(i)&&(await n.from("personal_bests").upsert({athlete_id:s,exercise_name:o.name,pb_type:a,value:i,achieved_at:new Date().toISOString(),exercise_result_id:t},{onConflict:"athlete_id,exercise_name,pb_type"}),await h(s,o.name,a,i,t))}}catch(e){console.error("Error updating personal bests:",e)}}async function x(s,r,t,e){try{const{data:o}=await n.from("personal_bests").select("value").eq("athlete_id",s).eq("exercise_name",r).eq("pb_type",t).single();return o?t==="time"?e<o.value:e>o.value:!0}catch{return!0}}const S={async createAssignment(s){const{data:r,error:t}=await n.from("workout_assignments").insert({workout_id:s.workoutId,athlete_id:s.athleteId,coach_id:s.coachId,assigned_date:s.assignedDate,notes:s.notes||null,status:"pending"}).select().single();if(t)throw console.error("Error creating assignment:",t),new Error("Failed to create workout assignment");return r},async createBatchAssignments(s){const r=s.athleteIds.map(o=>({workout_id:s.workoutId,athlete_id:o,coach_id:s.coachId,assigned_date:s.assignedDate,notes:s.notes||null,status:"pending"})),{data:t,error:e}=await n.from("workout_assignments").insert(r).select();if(e)throw console.error("Error creating batch assignments:",e),new Error("Failed to create workout assignments");return t},async getCoachAssignments(s){const{data:r,error:t}=await n.from("workout_assignments").select(`
        *,
        workout:workouts (
          id,
          name,
          workout_type,
          estimated_duration_min
        ),
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `).eq("coach_id",s).order("assigned_date",{ascending:!0});if(t)throw console.error("Error fetching coach assignments:",t),new Error("Failed to fetch assignments");return r||[]},async getAthleteAssignments(s){const{data:r,error:t}=await n.from("workout_assignments").select(`
        *,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min,
          exercises (
            id,
            name,
            sets,
            reps,
            order_index
          )
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `).eq("athlete_id",s).order("assigned_date",{ascending:!0});if(t)throw console.error("Error fetching athlete assignments:",t),new Error("Failed to fetch assignments");return r||[]},async fetchAssignmentsForDate(s,r){const{data:t,error:e}=await n.from("workout_assignments").select(`
        id,
        workout_id,
        athlete_id,
        coach_id,
        assigned_date,
        status,
        notes,
        created_at,
        workout:workouts (
          id,
          name,
          description,
          estimated_duration_min,
          workout_type
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `).eq("athlete_id",s).eq("assigned_date",r).order("created_at",{ascending:!0});if(e)throw console.error("Error fetching assignments for date:",e),new Error("Failed to fetch assignments for the selected date");return await Promise.all((t||[]).map(async a=>{const{data:i,error:d}=await n.from("exercises").select("*").eq("workout_id",a.workout_id).order("order_index",{ascending:!0});return d?(console.error("Error fetching exercises:",d),{...a,exercises:[]}):{...a,exercises:i||[]}}))},async fetchUpcomingAssignments(s){const r=new Date().toISOString().split("T")[0],t=new Date;t.setDate(t.getDate()+7);const e=t.toISOString().split("T")[0],{data:o,error:a}=await n.from("workout_assignments").select(`
        id,
        workout_id,
        assigned_date,
        status,
        athlete_id,
        coach_id,
        notes,
        created_at,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `).eq("athlete_id",s).gt("assigned_date",r).lte("assigned_date",e).order("assigned_date",{ascending:!0}).limit(6);return a?(console.error("Error fetching upcoming assignments:",a),[]):o||[]},async getAssignmentStats(s){const r=new Date,t=r.getDay(),e=t===0?-6:1-t,o=new Date(r);o.setDate(r.getDate()+e);const a=o.toISOString().split("T")[0],i=r.toISOString().split("T")[0],{count:d}=await n.from("workout_assignments").select("*",{count:"exact",head:!0}).eq("athlete_id",s).gte("assigned_date",a).lte("assigned_date",i),{count:u}=await n.from("workout_assignments").select("*",{count:"exact",head:!0}).eq("athlete_id",s).eq("status","completed").gte("assigned_date",a).lte("assigned_date",i),{count:c}=await n.from("workout_assignments").select("*",{count:"exact",head:!0}).eq("athlete_id",s).eq("status","pending").lte("assigned_date",i),_=d&&d>0?Math.round((u||0)/d*100):0;return{thisWeek:d||0,completed:u||0,pending:c||0,completionRate:_}},async getAssignmentsByDateRange(s,r,t){const{data:e,error:o}=await n.from("workout_assignments").select(`
        *,
        workout:workouts (
          id,
          name,
          workout_type
        ),
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username
        )
      `).eq("coach_id",s).gte("assigned_date",r).lte("assigned_date",t).order("assigned_date",{ascending:!0});if(o)throw console.error("Error fetching assignments by date:",o),new Error("Failed to fetch assignments");return e||[]},async getPendingAssignmentsCount(s){const r=new Date().toISOString().split("T")[0],{count:t,error:e}=await n.from("workout_assignments").select("*",{count:"exact",head:!0}).eq("athlete_id",s).eq("status","pending").gte("assigned_date",r);return e?(console.error("Error counting pending assignments:",e),0):t||0},async updateAssignmentStatus(s,r){const{data:t,error:e}=await n.from("workout_assignments").update({status:r}).eq("id",s).select().single();if(e)throw console.error("Error updating assignment status:",e),new Error("Failed to update assignment status");return t},async rescheduleAssignment(s,r){const{data:t,error:e}=await n.from("workout_assignments").update({assigned_date:r}).eq("id",s).select().single();if(e)throw console.error("Error rescheduling assignment:",e),new Error("Failed to reschedule assignment");return t},async updateAssignmentNotes(s,r){const{data:t,error:e}=await n.from("workout_assignments").update({notes:r}).eq("id",s).select().single();if(e)throw console.error("Error updating assignment notes:",e),new Error("Failed to update assignment notes");return t},async deleteAssignment(s){const{error:r}=await n.from("workout_assignments").delete().eq("id",s);if(r)throw console.error("Error deleting assignment:",r),new Error("Failed to delete assignment")},async getWorkoutAssignments(s){const{data:r,error:t}=await n.from("workout_assignments").select(`
        *,
        athlete:profiles!workout_assignments_athlete_id_fkey (
          id,
          display_name,
          username,
          avatar_url
        )
      `).eq("workout_id",s).order("assigned_date",{ascending:!0});if(t)throw console.error("Error fetching workout assignments:",t),new Error("Failed to fetch workout assignments");return r||[]},async getTodaysAssignments(s){const r=new Date().toISOString().split("T")[0],{data:t,error:e}=await n.from("workout_assignments").select(`
        *,
        workout:workouts (
          id,
          name,
          description,
          workout_type,
          estimated_duration_min,
          exercises (
            id,
            name,
            order_index
          )
        ),
        coach:profiles!workout_assignments_coach_id_fkey (
          id,
          display_name,
          avatar_url
        )
      `).eq("athlete_id",s).eq("assigned_date",r).eq("status","pending").order("created_at",{ascending:!0});if(e)throw console.error("Error fetching today's assignments:",e),new Error("Failed to fetch today's assignments");return t||[]}};export{S as a,E as b,x as c};
