# Xsite® MANAGE Partner SDK

Example code showing how Manage external access can be used.

## Prerequisites:

- Node 22 installed
- Latest Chrome
- Run `npm install`
- The following information about Xsite® MANAGE:
  - CLIENT_ID: OAuth2 client id assigned by Xsite® MANAGE to a client using the third-party API
  - CLIENT_SECRET: Secret string associated with the client, if available
  - API_KEY: Key provided by Xsite® MANAGE. Should be included in request headers as "Api-Key"
- Create file `.env` using `.env.sample` as a template. Replace example values
  with Xsite® MANAGE information listed above.

## Usage:

1. Run `npm start`
2. Open `http://localhost:3000/api` (or a different port, if so defined in `.env`)
3. Complete Xsite® MANAGE login flow
4. Observe refresh and id tokens returned in client stdout

## API Usage

### Common parameters

For OAuth2-based, authorization, please see the example code. CORS support is not available at the moment.

### Common errors

- 400 Bad request. Some request parameter is invalid
- 401 Unauthorized. Token valid, but no access to the requested resource
- 403 Forbidden. The token is probably not valid

Application error response body: [Response schema](schema/common-error-body.json).

Please note that systems between the application and the client also produce error responses of different formats.

### Paging

API endpoints that may return a large set of results may implement paging.
If there are too many results to fit in a single response, such API includes the field `nextToken` in its response.
The next page is fetched by sending the received value back in a field with the same name `nextToken`.

Note that any endpoint listed here supporting paging may change its maximum page size in the future.
Some APIs have huge page sizes (meaning no paging in effect), but the page size may be decreased in the future.

## API endpoints

`queryStringParameters` and `body` mentioned in the request schemas refer to HTTP GET querystring parameters and request body in the other HTTP methods.

You are not expected to send property `queryStringParameters` or `body` within the request body.

The schema of an object can include property `additionalProperties`.
If not set or set to `true`, object properties that have not been defined are allowed.
This means new properties can be added to the API without prior warning.
If set to `false` this is not possible.
Also new properties can be added to the API response without prior warning.

### GET https://api.prod.xsitemanage.com/ext/0/site/sites?nextToken={nextToken}&maxPageSize={maxPageSize}

Get user's sites

[Request schema](api/0/site/sites/get/request.json)
[Response schema](api/0/site/sites/get/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/user/organization/sites?nextToken={nextToken}&maxPageSize={maxPageSize}

Get user's home organization sites

[Request schema](api/0/user/organization/sites/get/request.json)
[Response schema](api/0/user/organization/sites/get/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/user/organization/site

Create a new site under the user's home organization. API expects content-type to be application/json

[Request schema](api/0/user/organization/site/post/request.json)
[Response schema](api/0/user/organization/site/post/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/user/organization/codelists

Get codelists available in the user's home organization

[Request schema](api/0/user/organization/codelists/get/request.json)
[Response schema](api/0/user/organization/codelists/get/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/user/organization/site/codelist

Add an existing home organization codelist to a site. API expects content-type to be application/json. The user must be an admin of the site, and the site must belong to the user's home organization.

[Request schema](api/0/user/organization/site/codelist/post/request.json)
[Response schema](api/0/user/organization/site/codelist/post/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/user/organization/coordinatefiles

Get coordinate files available in the user's home organization

[Request schema](api/0/user/organization/coordinatefiles/get/request.json)
[Response schema](api/0/user/organization/coordinatefiles/get/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/user/organization/coordinatefiles/add/presign?fileName={fileName}

Presign a coordinate system (.prm) or height system (.geoid) file upload to the user's home organization.
Upload the file content with HTTP PUT to the returned `uploadUrl`, with header `Content-Type: application/octet-stream` and without the `Authorization` and `Api-Key` headers.
The uploaded file then appears in the coordinate file listing; empty files are not listed. Uploading a file with an existing name replaces that file and gives it a new `fileId`.

[Request schema](api/0/user/organization/coordinatefiles/add/presign/get/request.json)
[Response schema](api/0/user/organization/coordinatefiles/add/presign/get/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/user/organization/site/coordinatefile

Add an existing home organization coordinate file to a site. API expects content-type to be application/json. The user must be an admin of the site, and the site must belong to the user's home organization.

[Request schema](api/0/user/organization/site/coordinatefile/post/request.json)
[Response schema](api/0/user/organization/site/coordinatefile/post/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/site/sites/machines?siteId={siteId}

Get sites machines

[Request schema](api/0/site/sites/machines/get/request.json)
[Response schema](api/0/site/sites/machines/get/response.json)

### GET https://api.prod.xsitemanage.com/ext/1/point/points?siteId={siteId}&since={sequenceId}&nextToken={nextToken}&maxPageSize={maxPageSize}

Get log points for a site

Request and response schemas: https://xsitemanage.com/schemas/3rdparty/index.html

### GET https://api.prod.xsitemanage.com/ext/2/point/points?siteId={siteId}&from={timestampMs}&to={timestampMs}&nextToken={nextToken}&maxPageSize={maxPageSize}

Get log points for a site within a timestamp range. Both `from` and `to` are inclusive. The point objects are the same as in `/ext/1/point/points`.

[Request schema](api/2/point/points/get/request.json)
[Response schema](api/2/point/points/get/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/model/latest?siteId={siteId}&nextToken={nextToken}&maxPageSize={maxPageSize}

Get site files

[Request schema](api/0/model/latest/get/request.json)
[Response schema](api/0/model/latest/get/response.json)

### GET https://api.prod.xsitemanage.com/ext/0/model/presign/file?siteId={siteId}&path={path}

Presign path in preparation of adding it to a site. May be a new path or update of existing one.

[Request schema](api/0/model/presign/get/request.json)
[Response schema](api/0/model/presign/get/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/model/command/add/file

Add a file in a temporary location in site model hierarchy. API expects content-type to be application/json

[Request schema](api/0/model/command/add/file/post/request.json)
[Response schema](api/0/model/command/add/file/post/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/model/command/add/folder

Add a folder to a site model hierarchy. API expects content-type to be application/json

[Request schema](api/0/model/command/add/folder/post/request.json)
[Response schema](api/0/model/command/add/folder/post/response.json)

### POST https://api.prod.xsitemanage.com/ext/0/model/command/delete/item

Delete a file or empty folder from a site model hierarchy. API expects content-type to be application/json. Deleting non-empty folders is not supported. Coordinate system files (.prm, .geoid) and root-folder codelist files (.jfcl, .nfcl) cannot be deleted.

[Request schema](api/0/model/command/delete/item/post/request.json)
[Response schema](api/0/model/command/delete/item/post/response.json)

## MQTT endpoint

Xsite MANAGE uses to MQTT over websocket to push notifications about machine activity on a site.
To start listening for the messages connect MQTT client to the endpoint and subscribe to an activity topic.
Only new events will be sent to the topic.
Last known location is not available.

In the example app, the machine activity page opens a WebSocket on the page's
host and port, passing `siteId` in the query string. The server starts an MQTT
client for that WebSocket and stops it when the browser disconnects. The page
reports a successful connection only after the MQTT subscription is confirmed.
Connection or subscription failures are shown on the page; reload to retry.

When connecting client to the endpoint, you need to pass `clientId` with the connection parameters.

`clientId` should conform to `prod-user-{userId}-{sessionId}`

- any string is allowed as an `sessionId`
- `userId` is the email of the user logged in

### wss://iot.prod.xsitemanage.com/mqtt?token={idToken}>&contextType=ext-site&contextId={siteId}

## topics:subscribe

Following topics are available for client to subscribe to.

### prod-ext/site:{siteId}/mcc:{machineId}/status

Single machine activity on a site

[Response schema](schema/mqtt-subscribe.json)

### prod-ext/site:{siteId}/+/status

All machine activity on a site

[Response schema](schema/mqtt-subscribe.json)
