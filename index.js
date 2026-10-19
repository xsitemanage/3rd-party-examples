const fastify = require("fastify")({ logger: true })
const axios = require("axios").default
const htmlencode = require("node-htmlencode")
const mqtt = require("mqtt")
const WebSocketServer = require("ws")

require("dotenv").config()

fastify.register(require("@fastify/multipart"))

fastify.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body)))
  },
)

const PORT = process.env.PORT
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
const CALLBACK_PATH = new URL(REDIRECT_URI).pathname
const AUTH_DOMAIN = process.env.AUTH_DOMAIN
const MANAGE_API_DOMAIN = process.env.MANAGE_API_DOMAIN
const API_KEY = process.env.API_KEY
const FILES_ORIGIN = `https://${process.env.FILES_DOMAIN}`
// CSRF token should not be static in production use
const CSRF_STATE = "REPLACE_WITH_CROSS_SITE_REQUEST_FORGERY_TOKEN"

const MAX_PAGE_SIZE = 25

function stylePage(payload) {
  const pageHead = `
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0 auto; padding: 24px; max-width: 1440px; color: #24292f; font-family: "Segoe UI", sans-serif; line-height: 1.5; }
        h1 { font-size: 24px; overflow-wrap: anywhere; }
        h2 { margin: 24px 0 12px; font-size: 18px; }
        a { color: #0969da; text-underline-offset: 3px; }
        .table-scroll { margin-top: 16px; overflow-x: auto; }
        table { display: block; width: 100%; margin-top: 16px; overflow-x: auto; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 12px 16px; border-bottom: 1px solid #d0d7de; text-align: left; vertical-align: middle; }
        th { background: #f6f8fa; font-weight: 600; white-space: nowrap; }
        td:first-child { min-width: 180px; overflow-wrap: anywhere; }
        td a { white-space: nowrap; }
        tbody tr:hover { background: #f6f8fa; }
        .number { text-align: center; font-variant-numeric: tabular-nums; }
        ul { padding: 0; list-style: none; }
        ul > li { margin: 16px 0; }
        form { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; }
        form:has(.field) { align-items: end; }
        label { font-size: 14px; font-weight: 600; }
        input, select, button { min-height: 38px; max-width: 100%; padding: 8px 12px; font: inherit; border: 1px solid #8c959f; border-radius: 4px; }
        select { background: #fff; }
        button { background: #f6f8fa; cursor: pointer; }
        button:hover { background: #eaeef2; }
        tt, pre { overflow-wrap: anywhere; white-space: pre-wrap; }
        .api-details { margin-top: 24px; border-top: 1px solid #d0d7de; padding-top: 16px; }
        .api-details > summary { cursor: pointer; font-weight: 600; }
        .api-details > summary:focus-visible { outline: 2px solid #0969da; outline-offset: 4px; }
        .api-details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
        .api-details-grid > section { min-width: 0; overflow-wrap: anywhere; }
        .operation-result { margin: 24px 0; padding: 16px 0; border-block: 1px solid #d0d7de; }
        .operation-result > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .operation-result p { margin: 0; overflow-wrap: anywhere; }
        .result-success { --result-color: #1a7f37; --result-background: #dafbe1; }
        .result-failure { --result-color: #cf222e; --result-background: #ffebe9; }
        .operation-result.result-success, .operation-result.result-failure { padding: 16px; border-color: var(--result-color); background: var(--result-background); }
        .operation-result > header > p, .api-details > summary[data-result] { color: var(--result-color); }
        .response-updated { animation: response-updated 1.6s ease-out; }
        .request-progress { position: fixed; top: 0; left: 0; right: 0; height: 4px; z-index: 100; overflow: hidden; background: #ddf4ff; }
        .request-progress::after { content: ""; display: block; width: 35%; height: 100%; background: #0969da; animation: request-progress 1s ease-in-out infinite; }
        .request-status { position: fixed; bottom: 16px; right: 16px; max-width: calc(100% - 32px); padding: 10px 16px; border: 1px solid #0969da; border-radius: 4px; background: #ddf4ff; color: #0550ae; z-index: 100; }
        body[aria-busy="true"] { cursor: progress; }
        @keyframes request-progress { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
        @keyframes response-updated { 0%, 40% { box-shadow: 0 0 0 4px var(--result-color); } 100% { box-shadow: 0 0 0 0 transparent; } }
        @media (prefers-reduced-motion: reduce) { .response-updated, .request-progress::after { animation: none; } .request-progress::after { width: 100%; } }
        @media (max-width: 600px) { body { padding: 16px; } th, td { padding: 10px 12px; } }
        @media (max-width: 800px) { .api-details-grid { grid-template-columns: minmax(0, 1fr); } }
      </style>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          const progress = document.createElement("div")
          progress.className = "request-progress"
          progress.hidden = true
          progress.setAttribute("aria-hidden", "true")
          const requestStatus = document.createElement("div")
          requestStatus.className = "request-status"
          requestStatus.setAttribute("role", "status")
          requestStatus.hidden = true
          document.body.prepend(progress, requestStatus)
          const beginRequest = () => {
            document.body.setAttribute("aria-busy", "true")
            progress.hidden = false
            requestStatus.hidden = false
            requestStatus.textContent = "Request in progress..."
          }
          window.addEventListener("pageshow", (event) => {
            document.body.removeAttribute("aria-busy")
            progress.hidden = true
            requestStatus.hidden = true
            if (event.persisted) document.getElementById("operation-result")?.remove()
          })
          document.addEventListener("submit", (event) => {
            const form = event.target
            const target = event.submitter?.formTarget || form.target
            if (!event.defaultPrevented && (!target || target === "_self")) beginRequest()
          })
          document.addEventListener("click", (event) => {
            const link = event.target.closest("a[href]")
            if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute("download") || (link.target && link.target !== "_self")) return
            const url = new URL(link.href, location.href)
            if (url.origin === location.origin && url.pathname.startsWith("/api/") && url.pathname !== "/api/download") beginRequest()
          })
          const operation = document.getElementById("operation-result")
          if (operation) {
            operation.classList.add("response-updated")
            operation.querySelector("[data-dismiss-operation]").addEventListener("click", () => {
              operation.remove()
            })
          }
          const listUrl = document.body.dataset.filesUrl
          if (listUrl) history.replaceState(null, "", listUrl)

          const organizeApiDetails = () => {
            const headings = Array.from(document.querySelectorAll("body > h2"))
            const requestHeading = headings.find((heading) => heading.textContent.trim() === "Request")
            const responseHeading = headings.find((heading) => heading.textContent.trim() === "Response")
            if (!requestHeading || !responseHeading) return
            document.querySelector("body > .api-details")?.remove()

            const details = document.createElement("details")
            details.className = "api-details"
            const summary = document.createElement("summary")
            summary.textContent = listUrl ? "List API details" : "API details"
            details.append(summary)
            const grid = document.createElement("div")
            grid.className = "api-details-grid"

            for (const heading of [requestHeading, responseHeading]) {
              const section = document.createElement("section")
              let sibling = heading.nextSibling
              section.append(heading)
              while (sibling && !(sibling.nodeType === 1 && sibling.tagName === "H2")) {
                const nextSibling = sibling.nextSibling
                section.append(sibling)
                sibling = nextSibling
              }
              grid.append(section)
            }

            details.append(grid)
            const responseSection = grid.lastElementChild
            const statusCode = Number(responseSection.querySelector("tt")?.textContent)
            if (statusCode >= 100 && statusCode <= 599) {
              const succeeded = statusCode >= 200 && statusCode < 300
              details.classList.add(succeeded ? "result-success" : "result-failure", "response-updated")
              summary.dataset.result = succeeded ? "success" : "failure"
              summary.textContent += " - HTTP " + statusCode
            }
            document.body.append(details)
          }
          organizeApiDetails()
        })
      </script>
      `

  return payload.includes("<head>")
    ? payload.replace("<head>", `<head>${pageHead}`)
    : payload.replace("<html>", `<html><head>${pageHead}</head>`)
}

fastify.addHook("onSend", async (request, reply, payload) => {
  if (
    typeof payload === "string" &&
    reply.getHeader("content-type")?.includes("text/html")
  ) {
    return stylePage(payload)
  }
  return payload
})

if (
  !CLIENT_ID ||
  !REDIRECT_URI ||
  !CALLBACK_PATH ||
  !AUTH_DOMAIN ||
  !MANAGE_API_DOMAIN ||
  !process.env.FILES_DOMAIN
) {
  throw new Error("Invalid configuration, check .env file")
}
// Received id token
let idToken
const wss = new WebSocketServer.Server({ server: fastify.server })
wss.on("connection", (ws, request) => {
  const send = (type, message) => {
    if (ws.readyState === WebSocketServer.OPEN) {
      ws.send(JSON.stringify({ type, message }))
    }
  }
  const siteId = new URL(request.url, "http://localhost").searchParams.get("siteId")
  let email
  try {
    email = JSON.parse(
      Buffer.from(idToken?.split(".")[1] || "", "base64url").toString(),
    ).email
  } catch (error) {
    fastify.log.error(error, "Cannot read user email for MQTT connection")
    send("error", "Please sign in again before viewing machine activity.")
    ws.close(1008, "Invalid login")
    return
  }
  if (!siteId || typeof email !== "string" || !email) {
    send("error", "A site and a signed-in user are required.")
    ws.close(1008, "Missing site or user")
    return
  }

  const query = new URLSearchParams({
    token: idToken,
    contextType: "ext-site",
    contextId: siteId,
  })
  const mqttClient = mqtt.connect(
    `wss://iot.prod.xsitemanage.com/mqtt?${query}`,
    {
      clientId: `prod-user-${email}-${Date.now()}`,
      protocol: "wss",
      reconnectPeriod: 0,
    },
  )
  let subscribed = false
  let failed = false
  const connectionError = (error) => {
    if (failed || ws.readyState !== WebSocketServer.OPEN) return
    failed = true
    const httpStatus = /Unexpected server response: (\d{3})/.exec(error.message)?.[1]
    const reason = httpStatus
      ? `The MQTT WebSocket handshake was rejected (HTTP ${httpStatus}).`
      : `The MQTT connection failed${error.code ? ` (code ${error.code})` : ""}.`
    fastify.log.error(
      { siteId, code: error.code, httpStatus },
      "Machine activity MQTT connection failed",
    )
    send("error", `${reason} Check the login and site access, then reload to retry.`)
    mqttClient.end(true)
  }

  ws.on("close", () => mqttClient.end(true))
  ws.on("error", (error) => {
    fastify.log.error(error, "Machine activity WebSocket error")
    mqttClient.end(true)
  })
  mqttClient.on("error", connectionError)
  // MQTT.js 4 suppresses some underlying WebSocket handshake errors.
  mqttClient.stream.on("error", connectionError)
  mqttClient.on("close", () => {
    if (!failed && ws.readyState === WebSocketServer.OPEN) {
      const message = subscribed
        ? "Disconnected. Reload the page to reconnect."
        : "The MQTT connection closed before the subscription was confirmed. Reload the page to retry."
      fastify.log.warn({ siteId }, message)
      send(subscribed ? "status" : "error", message)
    }
    ws.close()
  })
  mqttClient.on("connect", () => {
    const topic = `prod-ext/site:${siteId}/+/status`
    mqttClient.subscribe(topic, (error, granted) => {
      if (error || !granted?.length || granted.some((grant) => grant.qos === 128)) {
        failed = true
        fastify.log.error(
          { err: error, topic, granted },
          "Machine activity MQTT subscription failed",
        )
        send("error", "The MQTT subscription failed. Reload the page to retry.")
        mqttClient.end(true)
        return
      }
      subscribed = true
      send("status", "Connected; waiting for activity.")
    })
  })
  mqttClient.on("message", (topic, message) => {
    send("activity", message.toString())
  })
})

async function uploadFile({ presignUrl, fileBuffer }) {
  let response
  try {
    const axiosConfig = {
      // No id token here, it is passed in url query parameters when uploading!
      headers: {
        "Content-Type": "application/octet-stream",
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
      maxBodyLength: Infinity,
    }

    response = await axios.put(presignUrl, fileBuffer, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `UPLOAD file: Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`,
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  return response
}

async function callManageApi({ method, path, query = {}, body }) {
  let response
  const queryString = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ).toString()
  const callUrl = `https://${MANAGE_API_DOMAIN}/ext${path}${
    queryString ? `?${queryString}` : ""
  }`

  try {
    const axiosConfig = {
      headers: {
        Authorization: idToken,
        "Api-Key": API_KEY,
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    response = await axios({
      method,
      url: callUrl,
      data: body,
      ...axiosConfig,
    })

    const dataStr = JSON.stringify(response.data)
    console.log(
      `${method.toUpperCase()} ${path}: Manage API call response: Http status code: ${response.status}, Data: ${dataStr}`,
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  return { status: response.status, data: response.data, callUrl }
}

/**
 * Convert given json object for priting in html.
 * @param {*} object Json object
 * @returns html
 */
function htmlEncode(object) {
  return htmlencode.htmlEncode(JSON.stringify(object))
}

function htmlText(value) {
  return htmlencode.htmlEncode(String(value ?? ""))
}

/**
 * Base64 encode client id and secret for basic authentication
 */
function getBasicAuthorizationEncoded() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
}

/**
 * Calls Cognito TOKEN endpoint. Takes care of client_id parameter in body
 * and Authorization header using CLIENT_ID and CLIENT_SECRET
 * @param {*} data body to send
 */
async function callTokenEndpoint(data) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  }
  if (CLIENT_SECRET) {
    headers.Authorization = `Basic ${getBasicAuthorizationEncoded()}`
  } else {
    data.client_id = CLIENT_ID
  }
  try {
    const result = await axios.post(
      `https://${AUTH_DOMAIN}/oauth2/token`,
      new URLSearchParams(data).toString(),
      {
        headers,
      },
    )
    return result.data
  } catch (err) {
    console.log(
      `HTTP(S) error: '${err.message}'. Http status: '${
        err.response?.status
      }'. Data: '${JSON.stringify(err.response?.data)}'`,
    )
    throw new Error("Error while fetching tokens")
  }
}

/**
 * Exchange authorization code for refresh token
 * @param {string} code Authorization code received using callback
 * @returns {string} Refresh token
 */
const getRefreshToken = async (code) => {
  const data = {
    grant_type: "authorization_code",
    code: code,
    redirect_uri: REDIRECT_URI,
  }
  const tokens = await callTokenEndpoint(data)
  return tokens.refresh_token
}

/**
 * Exchange refresh token for id token
 * @param {string} refreshToken Refresh token received using authorization code
 * @returns {Promise<string>} Id token
 */
const getIdToken = async (refreshToken) => {
  const data = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }
  const tokens = await callTokenEndpoint(data)
  return tokens.id_token
}

// 1. Forward requests to authentication UI
fastify.get("/api", async (request, reply) => {
  reply.type("text/html")
  return `<html>
    <head>
      <script>
        window.location.replace('https://${AUTH_DOMAIN}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${CSRF_STATE}')
      </script>
    </head>
  </html>`
})

// 2. Process callback from authentication UI in order to get refresh token. Redirects to success URL
fastify.get(CALLBACK_PATH, async (request, reply) => {
  console.log("got callback", request.raw.url)
  const code = request.query.code
  const state = request.query.state
  if (state !== CSRF_STATE) throw new Error("CSRF token mismatch")
  // Store refresh token in a safe place for future use
  const refreshToken = await getRefreshToken(code)
  console.log("Refresh token: ", refreshToken)
  // Later refresh token can be used to get a short lived id token
  idToken = await getIdToken(refreshToken)
  console.log("Id token: ", idToken)
  reply.redirect("/success")
})

// 3. Notify user that authorization was successful
// 4. Do an example Manage api call with received token
fastify.get("/success", async (request, reply) => {
  reply.type("text/html")
  return `
    <html><body>
      <h1>Authentication</h1>
      <h2>Actions</h2>
      <ul>
      <li><a href="/api/list">List sites</a></li>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      </ul>
      <h2>Result</h2>
      Authentication successful
    </body></html>`
})

fastify.get("/api/list", async (request, reply) => {
  const response = await callManageApi({
    method: "get",
    path: "/0/site/sites",
    query: { maxPageSize: MAX_PAGE_SIZE, nextToken: request.query.nextToken },
  })

  let siteTableRows = ""
  for (const site of response.data?.items || []) {
    siteTableRows += `<tr>
      <td>${site.siteId}</td>
      <td>${site.name}</td>
      <td><a href="/api/points?siteId=${encodeURIComponent(site.siteId)}">List points</a></td>
      <td><a href="/api/files?siteId=${site.siteId}">List files</a></td>
      <td><a href="/api/machines?siteId=${site.siteId}">List machines</a></td>
      <td><a href="/api/status?siteId=${site.siteId}">Machine Acitvity</a></td>

    </tr>`
  }

  let nextPage = ""
  if (response.data?.nextToken)
    nextPage = `<a href="/api/list?nextToken=${encodeURIComponent(response.data.nextToken)}&maxPageSize=${MAX_PAGE_SIZE}">Next sites</a><br/>`

  reply.type("text/html")
  return `
    <html><body>
      <h1>List sites</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${htmlText(response.callUrl)}</tt>
      <h2>Received sites</h2>
      <table>
        <tr>
          <th>Id</th>
          <th>Name</th>
          <th>List points</th>
          <th>List files</th>
          <th>List machines</th>
          <th>Machine activity</th>
        </tr>
        ${siteTableRows}
      </table>
      <h2>Actions</h2>
      <ul>
      ${nextPage.length > 0 ? `<li>${nextPage}</li>` : ""}
      <li><a href="/api/list">List sites</a></li>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      <li><a href="/api/organization/coordinatefiles">Organization coordinate files</a></li>
      <li><a href="/api/organization/codelists">Organization codelists</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

function organizationSitesApiStep(response, pageNumber) {
  return {
    label: `List home organization sites${pageNumber ? ` (page ${pageNumber})` : ""}`,
    method: "GET",
    url: response.callUrl,
    response,
  }
}

async function getAllOrganizationSites() {
  const sites = []
  const steps = []
  let nextToken

  do {
    const response = await callManageApi({
      method: "get",
      path: "/0/user/organization/sites",
      query: { maxPageSize: MAX_PAGE_SIZE, nextToken },
    })
    steps.push(organizationSitesApiStep(response, steps.length + 1))
    if (response.status < 200 || response.status >= 300) break
    const data = response.data || {}
    sites.push(...(data.items || []))
    nextToken = data.nextToken
  } while (nextToken)

  return { sites, steps }
}

async function renderOrganizationSitesPage(request, reply, operation) {
  const response = await callManageApi({
    method: "get",
    path: "/0/user/organization/sites",
    query: {
      maxPageSize: MAX_PAGE_SIZE,
      nextToken: request.query.nextToken,
    },
  })
  const data = response.data || {}
  const sites = data.items || []
  const rows = sites
    .map((site) => {
      const siteId = encodeURIComponent(site.siteId)
      return `<tr>
        <td>${htmlText(site.siteId)}</td>
        <td>${htmlText(site.name)}</td>
        <td><a href="/api/files?siteId=${siteId}">List files</a></td>
        <td><a href="/api/points?siteId=${siteId}">List points</a></td>
        <td><a href="/api/machines?siteId=${siteId}">List machines</a></td>
        <td><a href="/api/status?siteId=${siteId}">Machine activity</a></td>
      </tr>`
    })
    .join("")
  const nextPage = data.nextToken
    ? `<li><a href="/api/organization/sites?${htmlencode.htmlEncode(
        new URLSearchParams({ nextToken: data.nextToken }).toString(),
      )}">Next sites</a></li>`
    : ""

  reply.type("text/html")
  return `
    <html><body>
      <h1>List home organization sites</h1>
      ${renderOperationResult(operation)}
      <h2>Create a site</h2>
      <form method="post" action="/api/organization/site/create">
        <div class="field">
          <label for="site-name">Name</label>
          <input id="site-name" name="name" value="Example site ${Date.now()}" required />
        </div>
        <div class="field">
          <label for="site-latitude">Latitude</label>
          <input id="site-latitude" name="uiLatitude" type="number" min="-90" max="90" step="any" value="60.1699" required />
        </div>
        <div class="field">
          <label for="site-longitude">Longitude</label>
          <input id="site-longitude" name="uiLongitude" type="number" min="-180" max="180" step="any" value="24.9384" required />
        </div>
        <button type="submit">Create site</button>
      </form>
      <h2>Received home organization sites</h2>
      <table>
        <thead><tr><th>Id</th><th>Name</th><th>List files</th><th>List points</th><th>List machines</th><th>Machine activity</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h2>Actions</h2>
      <ul>
      ${nextPage}
      <li><a href="/api/list">List sites</a></li>
      <li><a href="/api/organization/codelists">Organization codelists</a></li>
      <li><a href="/api/organization/coordinatefiles">Organization coordinate files</a></li>
      </ul>
      ${renderListApiDetails([organizationSitesApiStep(response)])}
    </body></html>`
}

fastify.get("/api/organization/sites", async (request, reply) => {
  return renderOrganizationSitesPage(request, reply)
})

fastify.post("/api/organization/site/create", async (request, reply) => {
  const form = request.body || {}
  const callBody = {
    name: form.name,
    uiLatitude: Number(form.uiLatitude),
    uiLongitude: Number(form.uiLongitude),
  }
  let response
  if (
    !callBody.name?.trim() ||
    !Number.isFinite(callBody.uiLatitude) ||
    callBody.uiLatitude < -90 ||
    callBody.uiLatitude > 90 ||
    !Number.isFinite(callBody.uiLongitude) ||
    callBody.uiLongitude < -180 ||
    callBody.uiLongitude > 180
  ) {
    reply.code(400)
    response = {
      status: 400,
      data: { error: "Enter a name and valid latitude and longitude" },
    }
  } else {
    response = await callManageApi({
      method: "post",
      path: "/0/user/organization/site",
      body: callBody,
    })
  }

  return renderOrganizationSitesPage(request, reply, {
    title: "Create site",
    path: callBody.name || "Site form",
    steps: [
      {
        label: "Create site",
        method: "POST",
        url: response.callUrl || "/api/organization/site/create",
        body: callBody,
        response,
      },
    ],
  })
})

async function renderOrganizationResourcesPage(
  request,
  reply,
  resourceKind,
  operation,
  selectedSiteId = request.query.siteId,
) {
  const isCodelist = resourceKind === "codelists"
  const resourceResponsePath = isCodelist
    ? "/0/user/organization/codelists"
    : "/0/user/organization/coordinatefiles"
  const resourceResponse = await callManageApi({
    method: "get",
    path: resourceResponsePath,
  })
  const organizationSites = await getAllOrganizationSites()
  const resourceData = resourceResponse.data || {}
  const resources = isCodelist
    ? resourceData.items || []
    : [
        ...(resourceData.coordinateSystems || []).map((item) => ({
          ...item,
          type: "Coordinate system",
        })),
        ...(resourceData.heightSystems || []).map((item) => ({
          ...item,
          type: "Height system",
        })),
      ]
  const resourceIdName = isCodelist ? "codelistId" : "fileId"
  const resourceLabel = isCodelist ? "codelist" : "coordinate file"
  const resourceType = isCodelist ? "codelists" : "coordinatefiles"
  const action = `/api/organization/site/${isCodelist ? "codelist" : "coordinatefile"}`
  const resourceRows = resources
    .map(
      (resource) => `<tr>
        <td>${htmlText(resource[resourceIdName])}</td>
        ${isCodelist ? "" : `<td>${htmlText(resource.type)}</td>`}
        <td>${htmlText(resource.name)}</td>
        ${isCodelist ? "" : `<td>${htmlText(resource.size)}</td><td>${htmlText(resource.lastModified)}</td>`}
      </tr>`,
    )
    .join("")
  const resourceOptions = resources
    .map((resource) => {
      const id = resource[resourceIdName]
      const label = `${resource.type ? `${resource.type}: ` : ""}${resource.name} (${id})`
      return `<option value="${htmlText(id)}">${htmlText(label)}</option>`
    })
    .join("")
  const siteOptions = organizationSites.sites
    .map((site) => {
      const selected = site.siteId === selectedSiteId ? " selected" : ""
      return `<option value="${htmlText(site.siteId)}"${selected}>${htmlText(site.name)} (${htmlText(site.siteId)})</option>`
    })
    .join("")
  const listSteps = [
    {
      label: `List home organization ${resourceType}`,
      method: "GET",
      url: resourceResponse.callUrl,
      response: resourceResponse,
    },
  ]
  const failedSiteRequest = organizationSites.steps.find(
    (step) => step.response.status < 200 || step.response.status >= 300,
  )

  reply.type("text/html")
  return `
    <html><body>
      <h1>List home organization ${resourceType}</h1>
      ${renderOperationResult(operation)}
      <h2>Received ${resourceType}</h2>
      <table>
        <thead><tr>
          <th>Id</th>
          ${isCodelist ? "" : "<th>Type</th>"}
          <th>Name</th>
          ${isCodelist ? "" : "<th>Size</th><th>Last modified</th>"}
        </tr></thead>
        <tbody>${resourceRows}</tbody>
      </table>
      <h2>Assign ${resourceLabel}</h2>
      ${failedSiteRequest ? `<p role="alert">The site dropdown could not be fully loaded (HTTP ${failedSiteRequest.response.status}). <a href="/api/organization/sites">Check home organization sites</a>.</p>` : ""}
      <form method="post" action="${action}">
        <div class="field">
          <label for="assign-resource">Select ${resourceLabel}</label>
          <select id="assign-resource" name="${resourceIdName}" required>
            <option value="">Select ${resourceLabel}</option>
            ${resourceOptions}
          </select>
        </div>
        <div class="field">
          <label for="assign-site">Site</label>
          <select id="assign-site" name="siteId" required>
            <option value="">Select site</option>
            ${siteOptions}
          </select>
        </div>
        <button type="submit">Assign to site</button>
      </form>
      <h2>Actions</h2>
      <ul>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      <li><a href="/api/organization/${isCodelist ? "coordinatefiles" : "codelists"}">Organization ${isCodelist ? "coordinate files" : "codelists"}</a></li>
      ${selectedSiteId ? `<li><a href="/api/files?siteId=${encodeURIComponent(selectedSiteId)}">List site files</a></li>` : ""}
      </ul>
      ${renderListApiDetails(listSteps)}
    </body></html>`
}

fastify.get("/api/organization/codelists", async (request, reply) => {
  return renderOrganizationResourcesPage(request, reply, "codelists")
})

fastify.post("/api/organization/site/codelist", async (request, reply) => {
  const { siteId, codelistId } = request.body
  const callBody = { siteId, codelistId }
  let response
  if (!siteId?.trim() || !codelistId?.trim()) {
    reply.code(400)
    response = {
      status: 400,
      data: { error: "Enter a site ID and select a codelist" },
    }
  } else {
    response = await callManageApi({
      method: "post",
      path: "/0/user/organization/site/codelist",
      body: callBody,
    })
  }

  return renderOrganizationResourcesPage(
    request,
    reply,
    "codelists",
    {
      title: "Assign codelist",
      path: `${codelistId || ""} to site ${siteId || ""}`,
      steps: [
        {
          label: "Assign codelist",
          method: "POST",
          url: response.callUrl || "/api/organization/site/codelist",
          body: callBody,
          response,
        },
      ],
    },
    siteId,
  )
})

fastify.post(
  "/api/organization/site/coordinatefile",
  async (request, reply) => {
    const { siteId, fileId } = request.body
    const callBody = { siteId, fileId }
    let response
    if (!siteId?.trim() || !fileId?.trim()) {
      reply.code(400)
      response = {
        status: 400,
        data: { error: "Enter a site ID and select a coordinate file" },
      }
    } else {
      response = await callManageApi({
        method: "post",
        path: "/0/user/organization/site/coordinatefile",
        body: callBody,
      })
    }

    return renderOrganizationResourcesPage(
      request,
      reply,
      "coordinatefiles",
      {
        title: "Assign coordinate file",
        path: `${fileId || ""} to site ${siteId || ""}`,
        steps: [
          {
            label: "Assign coordinate file",
            method: "POST",
            url: response.callUrl || "/api/organization/site/coordinatefile",
            body: callBody,
            response,
          },
        ],
      },
      siteId,
    )
  },
)

fastify.get("/api/organization/coordinatefiles", async (request, reply) => {
  return renderOrganizationResourcesPage(request, reply, "coordinatefiles")
})

fastify.get("/api/machines", async (request, reply) => {
  const response = await callManageApi({
    method: "get",
    path: "/0/site/sites/machines",
    query: { siteId: request.query.siteId },
  })

  let siteMachineRows = ""
  for (const machine of response.data?.items || []) {
    siteMachineRows += `<tr>
      <td>${machine.siteId}</td>
      <td>${machine.machineId}</td>
      <td>${machine.name}</td>
      <td>${machine.inactiveTimestamp || ""}</td>
    </tr>`
  }

  reply.type("text/html")
  return `
    <html><body>
      <h1>List sites machines</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${htmlText(response.callUrl)}</tt>
      <h2>Received sites machines</h2>
      <table>
        <tr>
          <th>SiteId</th>
          <th>MachineId</th>
          <th>Name</th>
          <th>Inactive Timestamp</th>
        </tr>
        ${siteMachineRows}
      </table>
      <ul>
      <h2>Actions</h2>
      <li><a href="/api/list">List sites</a></li>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

async function renderPointsPage(request, reply) {
  const { siteId, nextToken } = request.query
  const version =
    request.query.version ||
    (request.query.since !== undefined || nextToken ? "1" : "")
  const since = Number(request.query.since ?? 0)
  const to = Number(request.query.to ?? Date.now())
  const from = Number(request.query.from ?? to - 86400000)
  if (!siteId || (version && !["1", "2"].includes(version))) {
    return reply
      .code(400)
      .send({ error: "Select a site and a valid points API version" })
  }
  if (version === "1" && (!Number.isSafeInteger(since) || since < 0)) {
    return reply.code(400).send({
      error: "Since version must be a nonnegative integer sequence ID",
    })
  }
  if (
    version === "2" &&
    (!Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      !Number.isFinite(new Date(from).getTime()) ||
      !Number.isFinite(new Date(to).getTime()) ||
      from > to)
  ) {
    return reply
      .code(400)
      .send({ error: "Select a valid date range with From before To" })
  }
  let response
  if (version) {
    response = await callManageApi({
      method: "get",
      path: `/${version}/point/points`,
      query: {
        siteId,
        nextToken,
        maxPageSize: MAX_PAGE_SIZE,
        ...(version === "2" ? { from, to } : { since }),
      },
    })
  }
  const points = Array.isArray(response?.data)
    ? response.data
    : response?.data?.items || []
  const sequenceIds = points.map((point) => point.sequenceId)
  const minSequenceId = sequenceIds.length ? Math.min(...sequenceIds) : ""
  const maxSequenceId = sequenceIds.length ? Math.max(...sequenceIds) : ""
  let nextPage = ""
  if (response?.data?.nextToken) {
    const query = new URLSearchParams({
      siteId,
      version,
      nextToken: response.data.nextToken,
      ...(version === "2" ? { from, to } : { since }),
    })
    nextPage = `<li><a href="/api/points?${htmlencode.htmlEncode(query.toString())}">Get next page</a></li>`
  }
  const encodedSiteId = htmlencode.htmlEncode(siteId)

  reply.type("text/html")
  return `
    <html><body>
      <h1>List points of site ${encodedSiteId}</h1>
      ${
        response
          ? renderOperationResult({
              title: `Fetch points (v${version})`,
              path: siteId,
              steps: [
                {
                  label: `List points (v${version})`,
                  method: "GET",
                  url: response.callUrl,
                  response,
                },
              ],
            })
          : ""
      }
      ${
        response
          ? `<h2>Received points (v${version})</h2>
      <b>Count:</b> ${points.length}<br>
      <b>Min sequence id:</b> ${minSequenceId}<br>
      <b>Max sequence id:</b> ${maxSequenceId}<br>`
          : ""
      }
      <h2>Date range (v2)</h2>
      <form id="points-range" method="get" action="/api/points">
        <input type="hidden" name="siteId" value="${encodedSiteId}" />
        <input type="hidden" name="version" value="2" />
        <input type="hidden" name="from" value="${from}" />
        <input type="hidden" name="to" value="${to}" />
        <div class="field">
          <label for="points-from">From (local time)</label>
          <input id="points-from" type="datetime-local" step="0.001" required />
        </div>
        <div class="field">
          <label for="points-to">To (local time)</label>
          <input id="points-to" type="datetime-local" step="0.001" required />
        </div>
        <button type="submit">Fetch points</button>
      </form>
      <h2>Since version (v1)</h2>
      <form method="get" action="/api/points">
        <input type="hidden" name="siteId" value="${encodedSiteId}" />
        <input type="hidden" name="version" value="1" />
        <div class="field">
          <label for="points-since">Since version (sequence ID)</label>
          <input id="points-since" name="since" type="number" min="0" step="1" value="${Number.isSafeInteger(since) && since >= 0 ? since : 0}" required />
        </div>
        <button type="submit">Fetch points</button>
      </form>
      <h2>Actions</h2>
      <ul>
      ${nextPage}
      <li><a href="/api/files?siteId=${encodeURIComponent(siteId)}">List site files</a></li>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      <li><a href="/api/list">List sites</a></li>
      </ul>
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          const form = document.getElementById("points-range")
          const from = document.getElementById("points-from")
          const to = document.getElementById("points-to")
          for (const [input, name] of [[from, "from"], [to, "to"]]) {
            const date = new Date(Number(form.elements[name].value))
            if (Number.isFinite(date.getTime())) {
              input.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1)
            }
            input.addEventListener("input", () => to.setCustomValidity(""))
          }
          form.addEventListener("submit", (event) => {
            const start = new Date(from.value).getTime()
            const end = new Date(to.value).getTime()
            if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
              event.preventDefault()
              to.setCustomValidity("Select a valid range with From before To")
              to.reportValidity()
              return
            }
            form.elements.from.value = String(start)
            form.elements.to.value = String(end)
          })
        })
      </script>
    </body></html>`
}

fastify.get("/api/points", renderPointsPage)

function renderApiSteps(steps) {
  return steps
    .map(
      (step) => `
    <h3>${htmlencode.htmlEncode(step.label)}</h3>
    <div class="api-details-grid">
      <section>
        <h2>Request</h2>
        <b>Method:</b> <tt>${step.method}</tt><br>
        <b>Url:</b> <tt>${htmlencode.htmlEncode(step.url)}</tt><br>
        ${step.body === undefined ? "" : `<b>${step.bodyLabel || "Request body"}:</b> <tt>${htmlEncode(step.body)}</tt>`}
      </section>
      <section>
        <h2>Response</h2>
        <b>Response http status code:</b> <tt>${step.response.status}</tt><br>
        <b>Response data:</b> <tt>${htmlEncode(step.response.data)}</tt>
      </section>
    </div>`,
    )
    .join("")
}

function renderListApiDetails(steps) {
  const succeeded = steps.every(
    (step) => step.response.status >= 200 && step.response.status < 300,
  )
  return `<details class="api-details ${succeeded ? "result-success" : "result-failure"}">
    <summary data-result="${succeeded ? "success" : "failure"}">List API details - ${succeeded ? "succeeded" : "failed"}</summary>
    ${renderApiSteps(steps)}
  </details>`
}

function renderOperationResult(operation) {
  if (!operation) return ""
  const succeeded = operation.steps.every(
    (step) => step.response.status >= 200 && step.response.status < 300,
  )

  return `<section id="operation-result" class="operation-result ${succeeded ? "result-success" : "result-failure"}" aria-label="Latest operation">
    <header>
      <p role="status">${htmlencode.htmlEncode(operation.title)} ${succeeded ? "succeeded" : "failed"}: ${htmlencode.htmlEncode(operation.path)}</p>
      <button type="button" data-dismiss-operation>Dismiss</button>
    </header>
    <details class="api-details">
      <summary>Operation API details</summary>
      ${renderApiSteps(operation.steps)}
    </details>
  </section>`
}

function isProtectedModelFile(path) {
  return /\.(prm|geoid)$|^[^/]*\.(jfcl|nfcl)$/i.test(path)
}

async function renderFilesPage(request, reply, operation) {
  const siteId = request.query.siteId
  const nextToken = request.query.nextToken
  let response
  try {
    response = await callManageApi({
      method: "get",
      path: "/0/model/latest",
      query: { siteId, maxPageSize: MAX_PAGE_SIZE, nextToken },
    })
  } catch (err) {
    if (!operation) throw err
    response = { status: 502, data: { error: err.message } }
  }

  const files = [...(response.data?.items || [])].sort(
    (first, second) => second.version - first.version,
  )
  const totalSize = files.reduce(
    (total, file) => total + (file.type === "folder" ? 0 : file.size || 0),
    0,
  )
  const folderOptions = files
    .filter((file) => file.type === "folder")
    .map((folder) => {
      const path = htmlencode.htmlEncode(folder.path)
      return `<option value="${path}">${path}</option>`
    })
    .join("")

  let fileTableRows = ""
  for (const file of files) {
    const isFolder = file.type === "folder"
    const encodedUrl = encodeURIComponent(file.downloadUrl)
    const path = encodeURIComponent(file.path)
    fileTableRows += `<tr>
      <td>${htmlencode.htmlEncode(file.path)}</td>
      <td>${file.type || ""}</td>
      <td class="number">${isFolder ? "" : (file.size ?? "")}</td>
      <td class="number">${file.version}</td>
      <td>${new Date(file.timestampMs).toISOString()}</td>
      <td>${isFolder ? "" : `<a href="/api/download?url=${encodedUrl}&path=${path}">Download</a>`}</td>
      <td>${isProtectedModelFile(file.path) ? "" : `<a href="/api/deleteitem?siteId=${siteId}&path=${path}">Delete item</a>`}</td>
    </tr>`
  }

  let nextPage = ""

  if (response.data.nextToken)
    nextPage = `<a href="/api/files?siteId=${siteId}&nextToken=${encodeURIComponent(response.data.nextToken)}&maxPageSize=${MAX_PAGE_SIZE}">Get next page</a><br/>`
  reply.type("text/html")
  return `
    <html>
    <head>
      <title>Site files</title>
    </head>
    <body data-files-url="/api/files?${htmlencode.htmlEncode(new URLSearchParams(request.query).toString())}">
      <h1>List files of site ${siteId}</h1>
      ${renderOperationResult(operation)}
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${htmlText(response.callUrl)}</tt>
      <h2>Received files</h2>
      ${response.status >= 200 && response.status < 300 ? "" : `<p role="alert">The file list could not be refreshed. See List API details.</p>`}
      <b>Site version:</b> ${response.data?.siteVersion ?? ""}<br>
      <b>Count:</b> ${files.length}<br>
      <b>Total size:</b> ${totalSize}<br>
      <div class="table-scroll">
      <table>
        <thead>
        <tr>
          <th>Path</th>
          <th>Type</th>
          <th class="number">Size</th>
          <th class="number">Version</th>
          <th>Timestamp</th>
          <th>Download</th>
          <th>Delete item</th>
        </tr>
        </thead>
        <tbody>
        ${fileTableRows}
        </tbody>
      </table>
      </div>
      <h2>Actions</h2>
      <ul id="actions-list">
      ${nextPage.length > 0 ? `<li>${nextPage}</li>` : ""}
      <li>
        <form method="get" action="/api/addfolder">
          <input type="hidden" name="siteId" value="${siteId}" />
          <div class="field">
          <label for="folder-parent">Parent folder</label>
          <select id="folder-parent" name="parentPath">
            <option value="">Root (no folder)</option>
            ${folderOptions}
          </select>
          </div>
          <div class="field">
          <label for="folder-path">Folder name</label>
          <input id="folder-path" name="path" placeholder="example-folder" required />
          </div>
          <button type="submit">Add folder</button>
        </form>
      </li>
      <li>
        <form method="post" enctype="multipart/form-data" action="/api/upload?siteId=${siteId}">
          <div class="field">
          <label for="upload-folder">Destination folder</label>
          <select id="upload-folder" name="folderPath">
            <option value="">Root (no folder)</option>
            ${folderOptions}
          </select>
          </div>
          <div class="field">
          <label for="upload-custom">Upload selected file from disk</label>
          <input id="upload-custom" type="file" name="file" required />
          </div>
          <button type="submit">Upload file</button>
        </form>
      </li>
      <li><a href="list">List sites</a></li>
      <li><a href="/api/organization/sites">List home organization sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
      </body>
    </html>`
}

fastify.get("/api/files", async (request, reply) => {
  return renderFilesPage(request, reply)
})

fastify.get("/api/addfolder", async (request, reply) => {
  const { siteId } = request.query
  const folderName = (request.query.path || "").trim().replace(/^\/+|\/+$/g, "")
  const parentPath = (request.query.parentPath || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
  if (!folderName) {
    return reply.code(400).send({ error: "Enter a folder name" })
  }
  const path = `${parentPath ? `${parentPath}/` : ""}${folderName}/`
  const callBody = { siteId, path }
  const response = await callManageApi({
    method: "post",
    path: "/0/model/command/add/folder",
    body: callBody,
  })

  return renderFilesPage({ query: { siteId } }, reply, {
    title: "Add folder",
    path,
    steps: [
      {
        label: "Add folder",
        method: "POST",
        url: response.callUrl,
        body: callBody,
        response,
      },
    ],
  })
})

fastify.get("/api/deleteitem", async (request, reply) => {
  const { siteId, path } = request.query
  if (isProtectedModelFile(path)) {
    return reply
      .code(403)
      .send({ error: "PRM and GEOID files, and NFCL and JFCL files in the root folder, cannot be deleted" })
  }
  const callBody = { siteId, path }
  const response = await callManageApi({
    method: "post",
    path: "/0/model/command/delete/item",
    body: callBody,
  })

  return renderFilesPage({ query: { siteId } }, reply, {
    title: "Delete item",
    path,
    steps: [
      {
        label: "Delete item",
        method: "POST",
        url: response.callUrl,
        body: callBody,
        response,
      },
    ],
  })
})

fastify.get("/api/download", async (request, reply) => {
  const callUrl = request.query.url
  let downloadUrl
  try {
    downloadUrl = new URL(callUrl)
    if (typeof callUrl !== "string" || downloadUrl.origin !== FILES_ORIGIN) {
      throw new Error("Invalid download URL")
    }
  } catch {
    return reply
      .code(400)
      .send({ error: `A download URL under ${FILES_ORIGIN} is required` })
  }

  let response
  try {
    response = await axios.get(callUrl, {
      headers: { Authorization: idToken, "Api-Key": API_KEY },
      responseType: "stream",
      validateStatus: () => true,
      beforeRedirect: (options) => {
        const redirectOrigin = new URL(
          `${options.protocol}//${options.hostname}${options.port ? `:${options.port}` : ""}`,
        ).origin
        if (redirectOrigin !== downloadUrl.origin) {
          for (const header of Object.keys(options.headers)) {
            if (["authorization", "api-key"].includes(header.toLowerCase()))
              delete options.headers[header]
          }
        }
      },
    })
  } catch (err) {
    return reply.code(502).send({
      error: `The download connection failed${err.code ? ` (${err.code})` : ""}.`,
    })
  }

  if (response.status < 200 || response.status >= 300) {
    response.data.destroy()
    return reply.code(response.status).send({
      error: `The download server returned HTTP ${response.status}.`,
      upstreamStatus: response.status,
    })
  }
  const filename =
    (typeof request.query.path === "string"
      ? request.query.path.split(/[\\/]/).pop()
      : "") || "download"
  const encodedFilename = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return reply
    .header(
      "Content-Disposition",
      `attachment; filename="download"; filename*=UTF-8''${encodedFilename}`,
    )
    .header("X-Content-Type-Options", "nosniff")
    .type(response.headers["content-type"] || "application/octet-stream")
    .send(response.data)
})

fastify.post("/api/upload", async (request, reply) => {
  const file = await request.file()
  const { siteId } = request.query

  if (!file || !file.filename) {
    return reply.code(400).send({ error: "Select a file to upload" })
  }

  const fileBuffer = await file.toBuffer()
  const folderPath = (file.fields.folderPath?.value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
  const path = folderPath ? `${folderPath}/${file.filename}` : file.filename

  const operation = { title: "Upload file", path, steps: [] }
  const response = await callManageApi({
    method: "get",
    path: "/0/model/presign/file",
    query: { siteId, path },
  })
  operation.steps.push({
    label: "Presign file",
    method: "GET",
    url: response.callUrl,
    response,
  })
  if (response.status < 200 || response.status >= 300) {
    return renderFilesPage({ query: { siteId } }, reply, operation)
  }
  const { url: presignUrl, requestId: presignRequestId } = response.data

  const uploadResponse = await uploadFile({ presignUrl, fileBuffer })
  operation.steps.push({
    label: "Upload file bytes",
    method: "PUT",
    url: presignUrl,
    bodyLabel: "File metadata",
    body: { filename: file.filename, size: fileBuffer.length },
    response: uploadResponse,
  })
  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    return renderFilesPage({ query: { siteId } }, reply, operation)
  }
  const body = { siteId, path, presignRequestId }
  const addResponse = await callManageApi({
    method: "post",
    path: "/0/model/command/add/file",
    body,
  })
  operation.steps.push({
    label: "Add file",
    method: "POST",
    url: addResponse.callUrl,
    body,
    response: addResponse,
  })

  return renderFilesPage({ query: { siteId } }, reply, operation)
})

fastify.get("/api/status", async (request, reply) => {
  const { siteId } = request.query

  if (!idToken || !siteId) {
    reply.type("text/html")

    return `
    <html><body>
      <h1>Error</h1>
      <p>A site and a signed-in user are required.</p>
      <h2>Actions</h2>
      <ul>
      <li><a href="/api/list">List sites</li>
      </ul>
    </body></html>`
  }

  reply.type("text/html")
  return `
    <html>
      <head>
        <script>
        document.addEventListener("DOMContentLoaded", () => {
          const status = document.getElementById("connection-status")
          let failed = false
          const url = new URL("/", location.href)
          url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
          url.searchParams.set("siteId", new URLSearchParams(location.search).get("siteId"))
          const ws = new WebSocket(url)
          ws.addEventListener("message", event => {
            const message = JSON.parse(event.data)
            if (message.type !== "activity") {
              if (message.type === "error") failed = true
              if (!failed || message.type === "error") status.textContent = message.message
              return
            }
            const newMessageEl = document.createElement('li')
            newMessageEl.textContent = message.message
            const listEl = document.getElementsByClassName('messages')
            listEl[0].appendChild(newMessageEl)
          })
          ws.addEventListener("error", () => {
            failed = true
            status.textContent = "The WebSocket connection failed. Reload the page to retry."
          })
          ws.addEventListener("close", () => {
            if (!failed) status.textContent = "Disconnected. Reload the page to reconnect."
          })
        })
        </script>
      </head>
      <body>
        <h1>Success</h1>
        <p id="connection-status" role="status">Connecting to realtime status...</p>
        <ul class="messages">
        </ul>
        <h2>Actions</h2>
        <ul>
        <li><a href="/api/list">List sites</li>
        </ul>
      </body>
    </html>`
})

// Start local server
const start = async () => {
  console.log(`Starting http://localhost:${PORT}/api`)
  await fastify.listen({ port: PORT }, function (err, address) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  })
}

start()
