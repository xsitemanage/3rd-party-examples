#### PUT https://api.xsitemanage.com/ext/0/site/protection
Configure site directory protection. This should be set right after setting up the sync and creating the folder to which sync the data.
This should be unset before disconnecting the sync

Parameters
- siteId: site id (string, uuid)
- protection: Protection configuration like `{ "prefixes": { "protectedFolder/": "myCompany" } }`

Response: `schema/protection-put-response.json`
