
const FEED_URL =
  "https://pixelfed.social/users/felix_traveler.atom";

export async function onRequest({ request }) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" }
    });
  }

  try {
    const response = await fetch(FEED_URL, {
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) {
      return Response.json(
        {
          error: "Pixelfed feed request failed",
          status: response.status
        },
        {
          status: 502
        }
      );
    }

    const xml = await response.text();

    // Verify that the response is XML.
    if (!xml.trim().startsWith("<?xml") &&
        !xml.includes("<feed")) {
      return Response.json(
        { error: "Pixelfed returned an invalid Atom feed." },
        { status: 502 }
      );
    }

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });

  } catch (error) {
    return Response.json(
      {
        error: "Unable to connect to Pixelfed."
      },
      {
        status: 502
      }
    );
  }
}
