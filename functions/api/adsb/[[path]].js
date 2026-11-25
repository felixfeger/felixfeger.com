// functions/api/adsb/[[path]].js
//
// Same-domain relay between the website and the Raspberry Pi running dump1090.
//
//   GET /api/adsb/aircraft   ->  <ADSB_BASE>/aircraft.json
//   GET /api/adsb/receiver   ->  { lat, lon, refresh }
//
// Why this exists: the Pi's web server is on your home network and speaks
// plain http, so a browser on https://felixfeger.com can't talk to it
// directly (mixed content + not reachable from outside). The Pi exposes
// its data through a Cloudflare Tunnel, and this function is the only thing
// the page ever calls.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//
//   ADSB_BASE        required. Public address of the Pi's data folder, no
//                    trailing slash. For dump1090-fa / PiAware this is
//                    usually  https://adsb-origin.example.com/data
//   ADSB_AIRCRAFT    optional. File name of the aircraft list.
//                    Default "aircraft.json" (older dump1090 builds use
//                    "data.json").
//   ADSB_LAT/ADSB_LON  optional. Publish THIS position as the receiver
//                    instead of the real one. Use a rounded point nearby
//                    if you don't want your exact home on a public map.
//   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
//                    optional. Only if you put Cloudflare Access (service
//                    token) in front of the tunnel.

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

function fail(status, message) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function fetchUpstream(env, url) {
  const headers = { Accept: "application/json" };

  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  return fetch(url, { headers, signal: AbortSignal.timeout(4000) });
}

export async function onRequest({ request, env, params }) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" }
    });
  }

  const kind = Array.isArray(params.path) ? params.path[0] : params.path;

  // A fixed public receiver position, if one is configured.
  if (kind === "receiver" && env.ADSB_LAT && env.ADSB_LON) {
    return new Response(
      JSON.stringify({
        lat: Number(env.ADSB_LAT),
        lon: Number(env.ADSB_LON),
        refresh: 1000
      }),
      { headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=3600" } }
    );
  }

  if (!env.ADSB_BASE) {
    return fail(503, "ADSB_BASE is not configured.");
  }

  const base = String(env.ADSB_BASE).replace(/\/+$/, "");

  let file;
  if (kind === "aircraft") {
    file = env.ADSB_AIRCRAFT || "aircraft.json";
  } else if (kind === "receiver") {
    file = "receiver.json";
  } else {
    return fail(404, "Unknown endpoint.");
  }

  try {
    const upstream = await fetchUpstream(env, base + "/" + file);

    if (!upstream.ok) {
      return fail(502, "Receiver returned " + upstream.status + ".");
    }

    const data = await upstream.json();

    if (kind === "receiver") {
      // Only pass on what the page needs.
      return new Response(
        JSON.stringify({
          lat: data.lat,
          lon: data.lon,
          refresh: data.refresh || 1000
        }),
        { headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=3600" } }
      );
    }

    if (!data || !Array.isArray(data.aircraft)) {
      return fail(502, "Receiver returned an unexpected format.");
    }

    return new Response(JSON.stringify(data), {
      headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=1" }
    });
  } catch (error) {
    return fail(502, "Unable to reach the receiver.");
  }
}
