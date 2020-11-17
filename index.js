const fastify = require("fastify")()
const axios = require("axios").default
const htmlencode = require("node-htmlencode")
const { stringify } = require("querystring")
require("dotenv").config()

const PORT = process.env.PORT
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REDIRECT_URI = process.env.REDIRECT_URI
const AUTH_DOMAIN = process.env.AUTH_DOMAIN
const MANAGE_API_DOMAIN = process.env.MANAGE_API_DOMAIN
// CSRF token should not be static in production use
const CSRF_STATE = "REPLACE_WITH_CROSS_SITE_REQUEST_FORGERY_TOKEN"

// Received id token
let idToken

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
fastify.get("/", async (request, reply) => {
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
fastify.get("/callback", async (request, reply) => {
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
      <a href="list">List sites</a>
      <h2>Result</h2>
      Authentication successful
    </body></html>`
})

fastify.get("/list", async (request, reply) => {
  let response
  let callUrl
  const maxPageSize = request.query.maxPageSize || 5
  const nextToken = request.query.nextToken

  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/site/sites?maxPageSize=${maxPageSize}`
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
      <td><a href="points?siteId=${site.siteId}">List points</a></td>
      <td><a href="files?siteId=${site.siteId}">List files</a></td>
      <td><a href="protection?siteId=${site.siteId}">For protectedFolder/ as companyName</a></td>
      <td><a href="protection?siteId=${site.siteId}&disable=true">For protectedFolder/</a></td>
    </tr>`
  }

  let nextPage = ""
  if (response.data.nextToken)
    nextPage = `<a href="list?nextToken=${response.data.nextToken}&maxPageSize=${maxPageSize}">Next sites</a><br/>`

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
          <th>Enable protection</th>
          <th>Disable protection</th>
        </tr>
        ${siteTableRows}
      </table>
      <h2>Actions</h2>
      ${nextPage}
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/points", async (request, reply) => {
  const siteId = request.query.siteId
  const nextToken = request.query.nextToken
  const since = request.query.since
  const maxPageSize = request.query.maxPageSize || 5
  let response
  let callUrl

  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/point/points?siteId=${siteId}`
    if (request.query.nextToken) callUrl += `&nextToken=${nextToken}`
    callUrl += `&maxPageSize=${maxPageSize}`
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
    nextPage = `<a href="points?siteId=${siteId}&nextToken=${response.data.nextToken}&maxPageSize=${maxPageSize}&since=${since || 0}">Get next page</a><br/>`
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
      ${nextPage}
      <a href="points?siteId=${siteId}&since=1">Get points since sequenceId 1</a><br/>
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/files", async (request, reply) => {
  const siteId = request.query.siteId
  const maxPageSize = request.query.maxPageSize || 5
  const nextToken = request.query.nextToken
  let response
  let callUrl

  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/latest?siteId=${siteId}`
    if (maxPageSize) callUrl = callUrl + `&maxPageSize=${maxPageSize}`
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
      <td><a href="/download?url=${encodedUrl}">Download</a></td>
      <td><a href="/presign?siteId=${siteId}&path=${path}">Upload new version</a></td>
    </tr>`
  }

  const newPath = Date.now()
  let nextPage = ""

  if (response.data.nextToken)
    nextPage = `<br>
    <a href="files?siteId=${siteId}&nextToken=${response.data.nextToken}&maxPageSize=${maxPageSize}">Get next page</a><br/>`
  reply.type("text/html")
  return `
    <html><body>
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
      ${nextPage}
      <a href="presign?siteId=${siteId}&path=${newPath}">Upload new file with name ${newPath}</a><br/>
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/protection", async (request, reply) => {
  const siteId = request.query.siteId
  const disable = request.query.disable === "true"

  let response
  let callUrl
  let callBody

  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/site/protection`
    callBody = disable
      ? {
          siteId,
          protection: {},
        }
      : {
          siteId,
          protection: {
            prefixes: { "protectedFolder/": "companyName" },
          },
        }
    response = await axios.put(callUrl, callBody, axiosConfig)

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
      <h1>Set directory protection for site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>PUT</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt><br>
      <b>Request body:</b> <tt>${JSON.stringify(callBody)}</tt>
      <h2>Actions</h2>
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/download", async (request, reply) => {
  const callUrl = request.query.url

  let response
  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
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
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${response.data}</tt><br>
    </body></html>`
})

fastify.get("/presign", async (request, reply) => {
  const { siteId, path } = request.query

  let callUrl

  let response
  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/presign/file?siteId=${siteId}&path=${path}`
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

  const { url, requestId: presignRequestId } = response.data

  const encodedUrl = encodeURIComponent(url)
  reply.type("text/html")
  return `
    <html><body>
      <h1>Presigning path ${path} of site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>GET</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt><br>
      <h2>Actions</h2>
      <a href="upload?siteId=${siteId}&path=${path}&presignRequestId=${presignRequestId}&uploadUrl=${encodedUrl}">Upload file with contents <tt>test1\ntest2\n</tt></a><br>
      <a href="list">List sites</a>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/upload", async (request, reply) => {
  const { siteId, path, presignRequestId, uploadUrl: callUrl } = request.query

  let callBody
  let response
  try {
    const axiosConfig = {
      // No id token here, it is passed in url query parameters when uploading!
      headers: { "Content-Type": "application/octet-stream" },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callBody = "test1\ntest2\n"
    response = await axios.put(callUrl, callBody, axiosConfig)

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
      <h1>Uploading path ${path} of site ${siteId} as temporary file</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>POST</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt><br>
      <b>Request body:</b> <tt>${htmlEncode(callBody)}</tt>
      <h2>Actions</h2>
      <a href="addfile?siteId=${siteId}&path=${path}&presignRequestId=${presignRequestId}">Add uploaded file to site</a><br>
      <a href="list">List sites</a><br>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${htmlEncode(response.data)}</tt><br>
    </body></html>`
})

fastify.get("/addfile", async (request, reply) => {
  const { siteId, path, presignRequestId } = request.query

  let callUrl
  let callBody

  let response
  try {
    const axiosConfig = {
      headers: { Authorization: idToken },
      // Never throw, we simply want to print the response
      validateStatus: () => true,
    }

    callUrl = `https://${MANAGE_API_DOMAIN}/ext/0/model/command/add/file`
    callBody = { siteId, path, presignRequestId }
    response = await axios.post(callUrl, callBody, axiosConfig)

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
      <h1>Adding previously added temporary path ${path} to site ${siteId}</h1>
      <h2>Request</h2>
      <b>Method:</b> <tt>POST</tt><br>
      <b>Url:</b> <tt>${callUrl}</tt><br>
      <b>Request body:</b> <tt>${htmlEncode(callBody)}</tt>
      <h2>Actions</h2>
      <a href="files?siteId=${siteId}">List site files</a><br>
      <a href="list">List sites</a><br>
      <h2>Response</h2>
      <b>Response http status code</b>: <tt>${response.status}</tt><br>
      <b>Response data</b>: <tt>${JSON.stringify(response.data)}</tt><br>
    </body></html>`
})

// Start local server
const start = async () => {
  try {
    console.log(`Starting http://localhost:${PORT}`)
    await fastify.listen(PORT)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
