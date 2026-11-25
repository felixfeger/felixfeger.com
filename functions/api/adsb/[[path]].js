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

  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(4000)
  });
}

export async function onRequest({ request, env, params }) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" }
    });
  }

  const kind = Array.isArray(params.path)
    ? params.path[0]
    : params.path;

  // Never expose the real receiver.json coordinates.
  if (kind === "receiver") {
    const lat = Number(env.ADSB_LAT);
    const lon = Number(env.ADSB_LON);

    const hasPublicPosition =
      env.ADSB_LAT !== undefined &&
      env.ADSB_LAT !== "" &&
      env.ADSB_LON !== undefined &&
      env.ADSB_LON !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180;

    const payload = hasPublicPosition
      ? { lat, lon, refresh: 1000 }
      : { refresh: 1000 };

    return new Response(JSON.stringify(payload), {
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": "no-store"
      }
    });
  }

  if (kind !== "aircraft") {
    return fail(404, "Unknown endpoint.");
  }

  if (!env.ADSB_BASE) {
    return fail(503, "ADSB_BASE is not configured.");
  }

  const base = String(env.ADSB_BASE).replace(/\/+$/, "");
  const file = env.ADSB_AIRCRAFT || "aircraft.json";

  try {
    const upstream = await fetchUpstream(
      env,
      base + "/" + file
    );

    if (!upstream.ok) {
      return fail(502, "Receiver returned " + upstream.status + ".");
    }

    const data = await upstream.json();

    if (!data || !Array.isArray(data.aircraft)) {
      return fail(502, "Receiver returned an unexpected format.");
    }

    return new Response(JSON.stringify(data), {
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": "public, max-age=1"
      }
    });

  } catch (error) {
    return fail(502, "Unable to reach the receiver.");
  }
}
