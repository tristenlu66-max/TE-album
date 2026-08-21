import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.TE_ALBUM_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const $ = (id) => document.getElementById(id);
const state = { photos: [], albums: [], memberships: [], analyses: new Map(), view: "all", selectedAlbum: null, currentPhoto: null, lastRandomPhotoId: null, user: null, actor: null };

function configured(){ return cfg.supabaseUrl && cfg.supabaseAnonKey; }
function say(message){ $("upload-status").textContent = message || ""; }
function escapeHtml(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatDate(value){ return value ? new Date(value).toLocaleDateString("zh-CN", {year:"numeric",month:"long",day:"numeric"}) : "未标注日期"; }
function formatTime(value){ return value ? new Date(value).toLocaleString("zh-CN", {year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : ""; }
async function signed(path){ const {data,error}=await supabase.storage.from("album-private").createSignedUrl(path,300); if(error) throw error; return data.signedUrl; }
function activeAlbumsFor(photoId){ return state.memberships.filter(x=>x.photo_id===photoId).map(x=>state.albums.find(a=>a.id===x.album_id)).filter(Boolean); }
function photoSearchText(photo){ const analysis=state.analyses.get(photo.id); return [photo.title,photo.caption,photo.original_filename,analysis?.search_text,analysis?.analysis?.summary,analysis?.analysis?.ocr_text,...(analysis?.analysis?.tags||[])].filter(Boolean).join(" ").toLowerCase(); }

async function loadIdentity(){
  const {data:{user},error}=await supabase.auth.getUser(); if(error || !user) throw error || new Error("登录状态已失效，请重新登录");
  state.user=user;
  const {data:actor,error:actorError}=await supabase.from("actors").select("id,display_name").eq("auth_user_id",user.id).eq("actor_type","human").single();
  if(actorError) throw new Error("找不到 Tristen 的 actor 记录"); state.actor=actor;
}
async function refresh(){
  try{
    await loadIdentity();
    const deleted = state.view === "trash";
    let photoQuery=supabase.from("photos").select("*").order("taken_at",{ascending:false,nullsFirst:false}).order("uploaded_at",{ascending:false});
    photoQuery = deleted ? photoQuery.not("deleted_at","is",null) : photoQuery.is("deleted_at",null);
    const [{data:photoRows,error:photoError},{data:albumRows,error:albumError},{data:membershipRows,error:membershipError}]=await Promise.all([
      photoQuery,
      supabase.from("albums").select("id,title,description,cover_photo_id,updated_at").is("deleted_at",null).order("updated_at",{ascending:false}),
      supabase.from("album_photos").select("album_id,photo_id,position,added_at")
    ]);
    if(photoError) throw photoError; if(albumError) throw albumError; if(membershipError) throw membershipError;
    state.photos=photoRows||[]; state.albums=albumRows||[]; state.memberships=membershipRows||[];
    state.analyses=new Map();
    if(state.photos.length){
      const {data,error}=await supabase.from("photo_ai_analysis").select("photo_id,analysis,search_text,analyzed_at").in("photo_id",state.photos.map(p=>p.id));
      if(error) console.info("AI analysis is unavailable to the browser until Phase 4 SQL is applied",error.message);
      for(const row of data||[]) state.analyses.set(row.photo_id,row);
    }
    if(state.selectedAlbum && !state.albums.some(a=>a.id===state.selectedAlbum)) state.selectedAlbum=null;
    render();
  }catch(error){ say(`加载相册失败：${error.message}`); }
}
function visiblePhotos(){
  let rows=[...state.photos];
  if(state.view==="favorites") rows=rows.filter(p=>p.favorite);
  if(state.view==="albums" && state.selectedAlbum) rows=rows.filter(p=>state.memberships.some(m=>m.album_id===state.selectedAlbum&&m.photo_id===p.id));
  const query=$("search").value.trim().toLowerCase(); if(query) rows=rows.filter(p=>photoSearchText(p).includes(query));
  return rows;
}
async function render(){
  renderTabs(); renderAlbumPanel();
  const rows=visiblePhotos(); $("count").textContent=`${rows.length} 张照片`;
  $("empty-state").hidden=rows.length>0;
  $("empty-state").innerHTML=state.view==="trash"?"<h2>回收站是空的。</h2><p>删除的照片会暂时留在这里，可以随时恢复。</p>":"<h2>这里还没有照片。</h2><p>上传一张照片，让这本相册开始有记忆。</p>";
  const cards=await Promise.all(rows.map(async p=>{ try{ const url=await signed(p.thumb_path); const analysis=state.analyses.get(p.id); return `<article class="card" data-id="${p.id}"><div class="card-image"><img loading="lazy" src="${url}" alt="${escapeHtml(p.title||p.original_filename||"照片")}"><button class="heart ${p.favorite?"on":""}" data-favorite="${p.id}" aria-label="${p.favorite?"取消收藏":"收藏"}">${p.favorite?"♥":"♡"}</button>${analysis?'<span class="analysis-mark" title="已有 AI 分析">✦</span>':""}</div><div class="card-copy"><div class="card-title">${escapeHtml(p.title||"未命名照片")}</div><div class="card-meta">${formatDate(p.taken_at)}${activeAlbumsFor(p.id).length?` · ${activeAlbumsFor(p.id).length} 本相册`:""}</div></div></article>`; }catch(error){ console.error(error); return ""; }}));
  $("gallery").innerHTML=cards.join("");
  document.querySelectorAll(".card").forEach(el=>el.onclick=(event)=>{ if(!event.target.closest("[data-favorite]")) openPhoto(el.dataset.id); });
  document.querySelectorAll("[data-favorite]").forEach(el=>el.onclick=(event)=>{ event.stopPropagation(); toggleFavorite(el.dataset.favorite); });
}
function renderTabs(){ document.querySelectorAll(".tab").forEach(tab=>tab.classList.toggle("active",tab.dataset.view===state.view)); }
function renderAlbumPanel(){
  const panel=$("album-panel"); panel.hidden=state.view!=="albums"; if(panel.hidden) return;
  panel.innerHTML=`<div class="album-heading"><div><span class="eyebrow">COLLECTIONS</span><h2>相册</h2></div><button id="new-album-inline" class="button small">新建相册</button></div><div class="album-list"><button class="album-chip ${!state.selectedAlbum?"selected":""}" data-album="">全部相册</button>${state.albums.map(a=>`<button class="album-chip ${state.selectedAlbum===a.id?"selected":""}" data-album="${a.id}">${escapeHtml(a.title)} <span>${state.memberships.filter(m=>m.album_id===a.id).length}</span></button>`).join("")||'<p class="muted">还没有相册。先按一个记忆主题建一本吧。</p>'}</div>`;
  $("new-album-inline").onclick=createAlbum; document.querySelectorAll("[data-album]").forEach(el=>el.onclick=()=>{state.selectedAlbum=el.dataset.album||null;render();});
}
async function toggleFavorite(id){ const photo=state.photos.find(p=>p.id===id); if(!photo) return; const {data,error}=await supabase.from("photos").update({favorite:!photo.favorite,updated_at:new Date().toISOString()}).eq("id",id).select().single(); if(error){alert(`更新收藏失败：${error.message}`);return;} Object.assign(photo,data); render(); }
async function createAlbum(){ const title=prompt("相册名称"); if(!title?.trim()) return; const description=prompt("一句说明（可留空）")||null; const {error}=await supabase.from("albums").insert({owner_user_id:state.user.id,title:title.trim(),description,created_by_actor_id:state.actor.id}); if(error) alert(`新建相册失败：${error.message}`); else { state.view="albums"; await refresh(); } }

async function openPhoto(id){
  const p=state.photos.find(x=>x.id===id); if(!p) return; state.currentPhoto=p;
  try{
    const [image,{data:comments,error:commentsError}]=await Promise.all([signed(p.storage_path),supabase.from("photo_comments").select("*, author_actor:actors!photo_comments_author_actor_id_fkey(display_name,auth_user_id)").eq("photo_id",id).is("deleted_at",null).order("created_at")]);
    if(commentsError) throw commentsError;
    const analysis=state.analyses.get(id); const inAlbums=activeAlbumsFor(id);
    $("photo-detail").innerHTML=`<div class="detail"><div class="detail-image"><img src="${image}" alt="${escapeHtml(p.title||"照片")}"></div><section class="detail-side"><span class="eyebrow">${formatDate(p.taken_at)} · ${p.width||"?"} × ${p.height||"?"}</span><form id="photo-form" class="photo-form"><label>标题<input id="photo-title" maxlength="200" value="${escapeHtml(p.title||"")}" placeholder="给这张照片起个名字"></label><label>备注<textarea id="photo-caption" maxlength="4000" placeholder="这张照片的故事…">${escapeHtml(p.caption||"")}</textarea></label><label>拍摄日期<input id="photo-taken-at" type="datetime-local" value="${p.taken_at?new Date(p.taken_at).toISOString().slice(0,16):""}"></label><label class="check"><input id="photo-favorite" type="checkbox" ${p.favorite?"checked":""}> 收藏这张照片</label><button class="button primary">保存照片信息</button></form><section class="collection-box"><h3>放进相册</h3><div class="album-control"><select id="album-select"><option value="">选择一本相册…</option>${state.albums.map(a=>`<option value="${a.id}">${escapeHtml(a.title)}</option>`).join("")}</select><button id="add-to-album" class="button small">加入</button></div><div class="membership-list">${inAlbums.map(a=>`<span class="membership">${escapeHtml(a.title)} <button data-remove-album="${a.id}" title="移出相册">×</button></span>`).join("")||'<span class="muted">还没放进任何相册。</span>'}</div>${inAlbums.length?'<button id="set-cover" class="text-button">设为所选相册封面</button>':""}</section>${analysis?`<section class="analysis"><h3>AI 看见了什么 <span>✦</span></h3><p>${escapeHtml(analysis.analysis?.summary||"已分析")}</p>${analysis.analysis?.tags?.length?`<div class="tags">${analysis.analysis.tags.map(t=>`<span>${escapeHtml(t)}</span>`).join("")}</div>`:""}${analysis.analysis?.ocr_text?`<details><summary>识别到的文字</summary><p>${escapeHtml(analysis.analysis.ocr_text)}</p></details>`:""}</section>`:`<section class="analysis pending"><h3>AI 分析</h3><p>这张照片还没有 AI 分析。</p></section>`}<button id="trash-photo" class="danger-button">${state.view==="trash"?"恢复这张照片":"移入回收站"}</button><section class="comments"><h3>共同观看</h3><div id="comment-list">${renderComments(comments||[])}</div><form class="comment-form" id="comment-form"><input id="comment-input" maxlength="4000" placeholder="写一句话…" required><button class="button primary">留言</button></form></section></section></div>`;
    $("photo-dialog").showModal(); bindDetailEvents(p,comments||[]);
  }catch(error){ alert(`打开照片失败：${error.message}`); }
}
function renderComments(comments){ return comments.map(c=>{const mine=c.author_actor_id===state.actor?.id;return `<div class="comment"><div><b>${escapeHtml(c.author_actor?.display_name||"未知住户")}</b><time>${formatTime(c.created_at)}</time>${mine?`<span class="comment-actions"><button data-edit-comment="${c.id}">编辑</button><button data-delete-comment="${c.id}">删除</button></span>`:""}</div><p>${escapeHtml(c.body)}</p></div>`;}).join("")||'<p class="muted">还没有留言。</p>';}
function bindDetailEvents(photo,comments){
  $("photo-form").onsubmit=async(event)=>{event.preventDefault();const taken=$("photo-taken-at").value;const {data,error}=await supabase.from("photos").update({title:$("photo-title").value.trim()||null,caption:$("photo-caption").value.trim()||null,taken_at:taken?new Date(taken).toISOString():null,favorite:$("photo-favorite").checked,updated_at:new Date().toISOString()}).eq("id",photo.id).select().single();if(error)alert(`保存失败：${error.message}`);else{Object.assign(photo,data);say("照片信息已保存");render();}};
  $("comment-form").onsubmit=async(event)=>{event.preventDefault();const body=$("comment-input").value.trim();if(!body)return;const {error}=await supabase.from("photo_comments").insert({photo_id:photo.id,author_actor_id:state.actor.id,body});if(error)alert(`留言保存失败：${error.message}`);else openPhoto(photo.id);};
  $("trash-photo").onclick=()=>toggleTrash(photo); $("add-to-album").onclick=()=>addToAlbum(photo.id,$("album-select").value); document.querySelectorAll("[data-remove-album]").forEach(el=>el.onclick=()=>removeFromAlbum(photo.id,el.dataset.removeAlbum));
  if($("set-cover")) $("set-cover").onclick=()=>setCover(photo.id,$("album-select").value||activeAlbumsFor(photo.id)[0]?.id);
  document.querySelectorAll("[data-edit-comment]").forEach(el=>el.onclick=()=>editComment(comments.find(c=>c.id===el.dataset.editComment))); document.querySelectorAll("[data-delete-comment]").forEach(el=>el.onclick=()=>deleteComment(el.dataset.deleteComment,photo.id));
}
async function addToAlbum(photoId,albumId){ if(!albumId)return; const {error}=await supabase.from("album_photos").upsert({album_id:albumId,photo_id:photoId,added_by_actor_id:state.actor.id},{onConflict:"album_id,photo_id"});if(error)alert(`加入相册失败：${error.message}`);else{await refresh();openPhoto(photoId);} }
async function removeFromAlbum(photoId,albumId){ const {error}=await supabase.from("album_photos").delete().eq("album_id",albumId).eq("photo_id",photoId);if(error)alert(`移出相册失败：${error.message}`);else{await refresh();openPhoto(photoId);} }
async function setCover(photoId,albumId){ if(!albumId)return alert("先选择一本相册");const {error}=await supabase.from("albums").update({cover_photo_id:photoId,updated_at:new Date().toISOString()}).eq("id",albumId);if(error)alert(`设置封面失败：${error.message}`);else{say("相册封面已更新");await refresh();openPhoto(photoId);} }
async function toggleTrash(photo){ const restoring=state.view==="trash"; if(!restoring&&!confirm("移入回收站？照片与评论会保留，之后可恢复。"))return;const {error}=await supabase.from("photos").update({deleted_at:restoring?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",photo.id);if(error)alert(`${restoring?"恢复":"删除"}失败：${error.message}`);else{$("photo-dialog").close();say(restoring?"照片已恢复":"照片已移入回收站");await refresh();} }
async function editComment(comment){ if(!comment)return;const body=prompt("编辑留言",comment.body);if(body===null||!body.trim())return;const {error}=await supabase.from("photo_comments").update({body:body.trim(),updated_at:new Date().toISOString(),edited_by_actor_id:state.actor.id}).eq("id",comment.id);if(error)alert(`编辑失败：${error.message}`);else openPhoto(state.currentPhoto.id); }
async function deleteComment(id,photoId){ if(!confirm("删除这条留言？"))return;const {error}=await supabase.from("photo_comments").update({deleted_at:new Date().toISOString(),edited_by_actor_id:state.actor.id}).eq("id",id);if(error)alert(`删除失败：${error.message}`);else openPhoto(photoId); }

async function compress(file){ const bitmap=await createImageBitmap(file); const scale=Math.min(1,2560/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);let quality=.84,blob;do{blob=await new Promise(r=>canvas.toBlob(r,"image/webp",quality));quality-=.05;}while(blob.size>1500000&&quality>=.7);return {blob,width:canvas.width,height:canvas.height}; }
async function hash(file){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function upload(files){for(const file of files){try{say(`正在处理 ${file.name}…`);const sha=await hash(file);const {data:dup}=await supabase.from("photos").select("id").eq("sha256",sha).is("deleted_at",null).maybeSingle();if(dup){say(`${file.name} 已经在相册里，跳过`);continue;}const out=await compress(file),id=crypto.randomUUID(),base=`photos/${id}`;const {error:up}=await supabase.storage.from("album-private").upload(`${base}/display.webp`,out.blob,{contentType:"image/webp",upsert:false});if(up)throw up;const thumb=await makeThumb(out.blob);const {error:tu}=await supabase.storage.from("album-private").upload(`${base}/thumb.webp`,thumb,{contentType:"image/webp",upsert:false});if(tu)throw tu;const {error:db}=await supabase.from("photos").insert({id,owner_user_id:state.user.id,storage_path:`${base}/display.webp`,thumb_path:`${base}/thumb.webp`,original_filename:file.name,original_mime:file.type,original_bytes:file.size,display_bytes:out.blob.size,width:out.width,height:out.height,sha256:sha,created_by_actor_id:state.actor.id});if(db)throw db;say(`${file.name} 已加入相册`);}catch(error){say(`${file.name} 失败：${error.message}`);}}$("file-input").value="";await refresh();}
async function makeThumb(blob){const b=await createImageBitmap(blob),s=Math.min(1,640/Math.max(b.width,b.height)),c=document.createElement("canvas");c.width=Math.round(b.width*s);c.height=Math.round(b.height*s);c.getContext("2d").drawImage(b,0,0,c.width,c.height);return new Promise(r=>c.toBlob(r,"image/webp",.74));}
async function boot(){if(!configured()){ $("login-panel").hidden=false;$("login-error").textContent="请先在 public/config.js 填入 Supabase 配置。";return;}const {data:{session}}=await supabase.auth.getSession();if(session)showApp();$("login-form").onsubmit=async event=>{event.preventDefault();const {error}=await supabase.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error)$("login-error").textContent=error.message;else showApp();};$("file-input").onchange=event=>upload(event.target.files);$("logout-btn").onclick=()=>supabase.auth.signOut().then(()=>location.reload());$("close-dialog").onclick=()=>$("photo-dialog").close();$("search").oninput=render;$("random-btn").onclick=()=>{const rows=visiblePhotos();const candidates=rows.length>1?rows.filter(photo=>photo.id!==state.lastRandomPhotoId):rows;if(candidates.length){const photo=candidates[Math.floor(Math.random()*candidates.length)];state.lastRandomPhotoId=photo.id;openPhoto(photo.id);}};$("new-album-btn").onclick=createAlbum;document.querySelectorAll(".tab").forEach(tab=>tab.onclick=async()=>{state.view=tab.dataset.view;state.selectedAlbum=null;await refresh();});}
function showApp(){$("login-panel").hidden=true;$("app-panel").hidden=false;refresh();}
boot();
