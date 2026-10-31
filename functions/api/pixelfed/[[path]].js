
const PIXELFED = "https://pixelfed.social";

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405
    });
  }

  // Remove our local API prefix.
  const upstreamPath = url.pathname.replace(
    /^\/api\/pixelfed/,
    ""
  );

  // Only allow the account and status endpoints.
  const allowed =
    upstreamPath === "/api/v1/accounts/lookup" ||
    /^\/api\/v1\.1\/accounts\/username\/[\w.-]+$/.test(upstreamPath) ||
    /^\/api\/v1\/accounts\/\d+\/statuses$/.test(upstreamPath) ||
    /^\/api\/pixelfed\/v1\/accounts\/\d+\/statuses$/.test(upstreamPath);

  if (!allowed) {
    return new Response("Not found", {
      status: 404
    });
  }

  try {
    const upstreamURL = new URL(
      upstreamPath + url.search,
      PIXELFED
    );

    const response = await fetch(upstreamURL, {
      headers: {
        Accept: "application/json"
      }
    });

    const headers = new Headers();

    headers.set(
      "Content-Type",
      response.headers.get("Content-Type") ||
        "application/json"
    );

    headers.set("Cache-Control", "public, max-age=60");

    return new Response(response.body, {
      status: response.status,
      headers
    });

  } catch (error) {
    return Response.json(
      { error: "Pixelfed API unavailable" },
      { status: 502 }
    );
  }
}
