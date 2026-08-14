import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CLIENT_REDIRECTS = new Set(["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
const clients = new Map();
const codes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();
const TTL = { code: 300, access: 3600, refresh: 30 * 24 * 3600 };
const now = () => Math.floor(Date.now() / 1000);
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
const sha256 = (value) => createHash("sha256").update(value).digest("base64url");
const same = (a, b) => { const aa=Buffer.from(a), bb=Buffer.from(b); return aa.length===bb.length && timingSafeEqual(aa,bb); };

export const oauth = {
  metadata(base, resource) { return {issuer:base,authorization_endpoint:`${base}/oauth/authorize`,token_endpoint:`${base}/oauth/token`,registration_endpoint:`${base}/oauth/register`,response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],scopes_supported:["album"]}; },
  resourceMetadata(base, resource) { return {resource,authorization_servers:[base],scopes_supported:["album"],bearer_methods_supported:["header"]}; },
  register(body) { const name=String(body.client_name||"Claude").slice(0,100); const redirects=Array.isArray(body.redirect_uris)?body.redirect_uris:[]; if(!redirects.length||redirects.some((uri)=>!CLIENT_REDIRECTS.has(uri))) throw new Error("Only Claude callback URLs are supported"); const existing=[...clients.values()].find(c=>c.name===name&&JSON.stringify(c.redirects)===JSON.stringify(redirects)); if(existing)return {client_id:existing.id,client_name:existing.name,redirect_uris:existing.redirects,token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]}; const id=token(18); clients.set(id,{id,name,redirects}); return {client_id:id,client_name:name,redirect_uris:redirects,token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]}; },
  validate(query, resource) { const required=["response_type","client_id","redirect_uri","code_challenge","code_challenge_method"]; if(required.some((key)=>!query[key])) throw new Error("Missing OAuth authorization parameter"); if(query.response_type!=="code"||query.code_challenge_method!=="S256") throw new Error("Only authorization code with S256 PKCE is supported"); const client=clients.get(query.client_id); if(!client||!client.redirects.includes(query.redirect_uri)) throw new Error("Invalid OAuth client or redirect URI"); if(query.resource&&query.resource!==resource) throw new Error("Invalid resource"); return {client,redirectUri:query.redirect_uri,challenge:query.code_challenge,state:query.state||"",resource}; },
  issueCode(request) { const code=token(32); codes.set(code,{...request,expires:now()+TTL.code}); return code; },
  exchange(body) { const client=clients.get(body.client_id); if(!client||body.grant_type!=="authorization_code") throw new Error("Invalid authorization request"); const grant=codes.get(body.code); codes.delete(body.code); if(!grant||grant.expires<now()||grant.client.id!==client.id||grant.redirectUri!==body.redirect_uri||sha256(body.code_verifier)!==grant.challenge) throw new Error("Invalid or expired authorization code"); return issueTokens(client.id,grant.resource); },
  refresh(body) { const grant=refreshTokens.get(body.refresh_token); if(!grant||grant.expires<now()||body.grant_type!=="refresh_token") throw new Error("Invalid refresh token"); refreshTokens.delete(body.refresh_token); return issueTokens(grant.clientId,grant.resource); },
  validAccess(value, resource) { const grant=accessTokens.get(value); return Boolean(grant&&grant.expires>now()&&grant.resource===resource); },
};

function issueTokens(clientId, resource) { const access=token(32), refresh=token(48); accessTokens.set(access,{clientId,resource,expires:now()+TTL.access}); refreshTokens.set(refresh,{clientId,resource,expires:now()+TTL.refresh}); return {access_token:access,token_type:"Bearer",expires_in:TTL.access,refresh_token:refresh,scope:"album"}; }

export function ownerPasswordMatches(value) { const expected=process.env.ALBUM_OAUTH_PASSWORD||process.env.ALBUM_MCP_TOKEN||""; return Boolean(expected&&same(String(value||""),expected)); }
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
