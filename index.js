const fastify = require("fastify")({logger: true})
const axios = require("axios").default
const htmlencode = require("node-htmlencode")
const { stringify } = require("querystring")
const mqtt = require("mqtt")
const WebSocketServer = require("ws")


require("dotenv").config()

fastify.register(require("@fastify/multipart"))

const PORT = process.env.PORT
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
const CALLBACK_PATH = new URL(REDIRECT_URI).pathname
const AUTH_DOMAIN = process.env.AUTH_DOMAIN
const MANAGE_API_DOMAIN = process.env.MANAGE_API_DOMAIN
const API_KEY = process.env.API_KEY
// CSRF token should not be static in production use
const CSRF_STATE = "REPLACE_WITH_CROSS_SITE_REQUEST_FORGERY_TOKEN"

const MAX_PAGE_SIZE = 25

if (
  !CLIENT_ID ||
  !REDIRECT_URI ||
  !CALLBACK_PATH ||
  !AUTH_DOMAIN ||
  !MANAGE_API_DOMAIN
) {
  throw new Error("Invalid configuration, check .env file")
}
// Received id token
let idToken
let wsClient
const wss = new WebSocketServer.Server({port: 8080})
wss.on("connection", ws => {
  wsClient = ws
})

async function presignFile({ siteId, path }) {
  let response
  const callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/presign/file?siteId=${siteId}&path=${path}`

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,

    }
    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `PRESIGN: Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  return { ...response, callUrl }
}

async function uploadFile({ presignUrl, fileBuffer }) {
  let response
  try {
    const axiosConfig = {
      // No id token here, it is passed in url query parameters when uploading!
      headers: { 
        "Content-Type": "application/octet-stream",
        "Api-Key": API_KEY
       },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
      maxBodyLength: Infinity,
    }

    response = await axios.put(presignUrl, fileBuffer, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `UPLOAD file: Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  return response
}

async function addFile({ siteId, path, presignRequestId }) {
  let response
  const callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/command/add/file`

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    const callBody = { siteId, path, presignRequestId }
    console.log(callBody)
    response = await axios.post(callUrl, callBody, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `ADD: Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  return { ...response, callUrl }
}

/**
 * Convert given json object for priting in html.
 * @param {*} object Json object
 * @returns html
 */
function htmlEncode(object) {
  return htmlencode.htmlEncode(JSON.stringify(object))
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
      stringify(data),
      {
        headers,
      }
    )
    return result.data
  } catch (err) {
    console.log(
      `HTTP(S) error: '${err.message}'. Http status: '${
        err.response.status
      }'. Data: '${JSON.stringify(err.response.data)}'`
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
 * @param {string} code Authorization code received using callback
 * @returns {string} Refresh token
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
      <li><a href="/api/list">List sites</li>
      </ul>
      <h2>Result</h2>
      Authentication successful
    </body></html>`
})

fastify.get("/api/list", async (request, reply) => {
  let response
  let callUrl
  const nextToken = request.query.nextToken

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/site/sites?maxPageSize=${MAX_PAGE_SIZE}`
    if (nextToken) callUrl += `&nextToken=${nextToken}`

    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  let siteTableRows = ""
  for (const site of response.data.items) {
    siteTableRows += `<tr>
      <td>${site.siteId}</td>
      <td>${site.name}</td>
      <td><a href="/api/points?siteId=${site.siteId}">List points</a></td>
      <td><a href="/api/files?siteId=${site.siteId}">List files</a></td>
      <td><a href="/api/machines?siteId=${site.siteId}">List machines</a></td>
      <td><a href="/api/status?siteId=${site.siteId}">Machine Acitvity</a></td>

    </tr>`
  }

  let nextPage = ""
  if (response.data.nextToken)
    nextPage = `<a href="/api/list?nextToken=${response.data.nextToken}&maxPageSize=${MAX_PAGE_SIZE}">Next sites</a><br/>`

  reply.type("text/html")
  return `
    <html><body>
      <h1>List sites</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt>
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
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/api/machines", async (request, reply) => {
  let response
  let callUrl
  const siteId = request.query.siteId

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/site/sites/machines?siteId=${siteId}`

    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites machines call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  let siteMachineRows = ""
  for (const machine of response.data.items) {
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
      <b>Url:</b> <tt>${callUrl}</tt>
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
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/api/points", async (request, reply) => {
  const siteId = request.query.siteId
  const nextToken = request.query.nextToken
  const since = request.query.since
  let response
  let callUrl

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/1/point/points?siteId=${siteId}`
    if (request.query.nextToken) callUrl += `&nextToken=${nextToken}`
    callUrl += `&maxPageSize=${MAX_PAGE_SIZE}`
    if (request.query.since) callUrl += `&since=${since}`
    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  const points = response.data.items
  const sequenceIds = points.map((p) => p.sequenceId)
  const minSequenceId = Math.min(...sequenceIds)
  const maxSequenceId = Math.max(...sequenceIds)
  let nextPage = ""
  if (response.data.nextToken)
    nextPage = `<a href="/api/points?siteId=${siteId}&nextToken=${
      response.data.nextToken
    }&maxPageSize=${MAX_PAGE_SIZE}&since=${since || 0}">Get next page</a><br/>`
  reply.type("text/html")
  return `
    <html><body>
      <h1>List logpoints of site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt>
      <h2>Received points</h2>
      <b>Count:</b> ${points.length}<br>
      <b>Min sequence id:</b> ${minSequenceId}<br>
      <b>Max sequence id:</b> ${maxSequenceId}<br>
      <h2>Actions</h2>
      <ul>
      ${nextPage.length > 0 ? `<li>${nextPage}</li>` : ""}
      <li><a href="/api/points?siteId=${siteId}&since=1">Get points since sequenceId 1</a></li>
      <li><a href="/api/list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/api/files", async (request, reply) => {
  const siteId = request.query.siteId
  const nextToken = request.query.nextToken
  let response
  let callUrl

  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/latest?siteId=${siteId}&maxPageSize=${MAX_PAGE_SIZE}`
    if (nextToken) callUrl = callUrl + `&nextToken=${nextToken}`
    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  const files = response.data.items
  const totalSize = files.reduce((total, file) => total + (file.size || 0), 0)

  let fileTableRows = ""
  for (const file of files) {
    const encodedUrl = encodeURIComponent(file.downloadUrl)
    const path = file.path
    fileTableRows += `<tr>
      <td>${file.path}</td>
      <td>${file.type || ""}</td>
      <td>${file.size}</td>
      <td>${file.version}</td>
      <td>${new Date(file.timestampMs).toISOString()}</td>
      <td><a href="/api/download?url=${encodedUrl}">Download</a></td>
      <td><a href="/api/presign?siteId=${siteId}&path=${path}">Upload new version</a></td>
    </tr>`
  }

  const newPath = Date.now()
  let nextPage = ""

  if (response.data.nextToken)
    nextPage = `<a href="api/files?siteId=${siteId}&nextToken=${response.data.nextToken}&maxPageSize=${MAX_PAGE_SIZE}">Get next page</a><br/>`
  reply.type("text/html")
  return `
    <html>
    <body>
      <h1>List files of site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt>
      <h2>Received files</h2>
      <b>Site version:</b> ${response.data.siteVersion}<br>
      <b>Count:</b> ${files.length}<br>
      <b>Total size:</b> ${totalSize}<br>
      <table>
        <tr>
          <th>Path</th>
          <th>Type</th>
          <th>Size</th>
          <th>Version</th>
          <th>Timestamp</th>
          <th>Download</th>
          <th>Upload new version</th>
        </tr>
        ${fileTableRows}
      </table>
      <h2>Actions</h2>
      <ul id="actions-list">
      ${nextPage.length > 0 ? `<li>${nextPage}</li>` : ""}
      <li><a href="presign?siteId=${siteId}&path=${newPath}">Presign new file with name ${newPath}</a></li>
      <li>
        <form method="post" enctype="multipart/form-data" action="/api/upload?siteId=${siteId}">
          <label for="upload-custom">Upload selected file from disk</label>
          <input id="upload-custom" type="file" name="file" />
          <button type="submit">Presign, upload and add the file</button>
        </form>
      </li>
      <li><a href="list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
      </body>
    </html>`
})

fastify.get("/api/download", async (request, reply) => {
  const callUrl = request.query.url

  let response
  try {
    const axiosConfig = {
      headers: { 
        Authorization: idToken,
        "Api-Key": API_KEY
      },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    response = await axios.get(callUrl, axiosConfig)

    const dataStr = JSON.stringify(response.data)
    console.log(
      `Manage sites call response: Http status code: ${response.status}, Data: ${dataStr}`
    )
  } catch (err) {
    const msg = `Error during Manage api call: ${err}`
    console.log(msg)
    throw new Error(msg)
  }

  reply.type("text/html")
  return `
    <html><body>
      <h1>Downloaded file at ${decodeURIComponent(callUrl)}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt><br>
      <h2>Actions</h2>
      <ul>
      <li><a href="list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${response.data}</tt><br>
    </body></html>`
})

fastify.get("/api/presign", async (request, reply) => {
  const { siteId, path } = request.query

  const response = await presignFile({ siteId, path })
  const { url, requestId: presignRequestId } = response.data

  const encodedUrl = encodeURIComponent(url)
  reply.type("text/html")
  return `
    <html><body>
      <h1>Presigning path ${path} of site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${response.callUrl}</tt><br>
      <h2>Actions</h2>
      <ul>
      <li><a href="upload?siteId=${siteId}&path=${path}&presignRequestId=${presignRequestId}&uploadUrl=${encodedUrl}">Upload file with contents: <tt>test1\ntest2\n</tt></a></li>
      <li><a href="list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/api/upload", async (request, reply) => {
  const { siteId, path, presignRequestId, uploadUrl } = request.query
  const callBody = "test1\ntest2\n"
  const response = await uploadFile({
    presignUrl: uploadUrl,
    fileBuffer: Buffer.from(callBody),
  })

  reply.type("text/html")
  return `
    <html><body>
      <h1>Uploading path ${path} of site ${siteId} as temporary file</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>POST</tt><br>
      <b>Url:</b> <tt>${uploadUrl}</tt><br>
      <b>Request body:</b> <tt>${htmlEncode(callBody)}</tt>
      <h2>Actions</h2>
      <ul>
      <li><a href="addfile?siteId=${siteId}&path=${path}&presignRequestId=${presignRequestId}">Add uploaded file to site</a></li>
      <li><a href="list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.post("/api/upload", async (request, reply) => {
  const file = await request.file()
  const { siteId } = request.query

  const response = await presignFile({ siteId, path: file.filename })
  const { url: presignUrl, requestId: presignRequestId } = response.data

  const fileBuffer = await file.toBuffer()

  await uploadFile({ presignUrl, fileBuffer })
  await addFile({ siteId, path: file.filename, presignRequestId })

  reply.redirect(`files?siteId=${siteId}`)
})

fastify.get("/api/addfile", async (request, reply) => {
  const { siteId, path, presignRequestId } = request.query

  const callBody = { siteId, path, presignRequestId }
  const response = await addFile(callBody)

  reply.type("text/html")
  return `
    <html><body>
      <h1>Adding previously added temporary path ${path} to site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>POST</tt><br>
      <b>Url:</b> <tt>${response.callUrl}</tt><br>
      <b>Request body:</b> <tt>${htmlEncode(callBody)}</tt>
      <h2>Actions</h2>
      <ul>
      <li><a href="files?siteId=${siteId}">List site files</a></li>
      <li><a href="list">List sites</a></li>
      </ul>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/api/status", async (request, reply) => {
  const { siteId } = request.query
  const email = JSON.parse(Buffer.from(idToken?.split(".")[1], "base64").toString()).email

  if (!email || !siteId) {
    reply.type("text/html")

    return `
    <html><body>
      <h1>Error</h1>
      <p>unknown site: "${siteId}" or user: "${email}"</p>
      <h2>Actions</h2>
      <ul>
      <li><a href="/api/list">List sites</li>
      </ul>
    </body></html>`
  }


  const mqttClient = mqtt.connect(
    `wss://iot.prod.xsitemanage.com/mqtt?token=${idToken}&contextType=ext-site&contextId=${siteId}`,
    { clientId: `prod-user-${email}-${Date.now()}`, protocol: "wss" }
  )

  mqttClient.subscribe(`prod-ext/site:${siteId}/+/status`)

  mqttClient.on("message", (topic, message) => {
    const messageStr = Buffer.from(message).toString()
    wsClient.send(messageStr)
  })

  mqttClient.on("close", () => {
    mqttClient.end(true)
    wsClient.close()
  })

  reply.type("text/html")
  return `
    <html>
      <head>
        <script>
          const ws = new WebSocket("ws://localhost:8080")
          ws.addEventListener("message", event => {
            const newMessageEl = document.createElement('li')
            newMessageEl.innerText = event.data
            const listEl = document.getElementsByClassName('messages')
            listEl[0].appendChild(newMessageEl)
          })
        </script>
      </head>
      <body>
        <h1>Success</h1>
        <p>connected to realtime status</p>
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
  await fastify.listen({port: PORT}, function (err, address) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
  })
}

start()
