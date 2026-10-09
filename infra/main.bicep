targetScope = 'resourceGroup'

@description('Region for all resources.')
param location string = resourceGroup().location

@description('Short name used in resource names.')
@minLength(3)
@maxLength(9)
param appName string = 'airport'

@secure()
@description('data.go.kr service key (decoded). Stored in Key Vault only.')
param dataGoKrKey string

@description('Object ID of the deploying user/principal. Gets Blob Data Contributor for web uploads and backfill.')
param deployerPrincipalId string = ''

@allowed(['User', 'ServicePrincipal', 'Group'])
param deployerPrincipalType string = 'User'

@description('E-mail for metric and budget alerts.')
param alertEmail string

@description('Budget start (first day of a month). Keep the original value on redeploys.')
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('Custom domain for the dashboard (e.g. icn.example.com). Added to CORS; bind it to the SWA in the portal.')
param webDomain string = ''

@description('Static Web Apps region (Korea Central is not offered; content is served globally).')
param swaLocation string = 'eastasia'

var suffix = uniqueString(resourceGroup().id)
var tags = { project: appName }

module swa 'modules/swa.bicep' = {
  name: 'swa'
  params: {
    name: 'swa-${appName}-${take(suffix, 6)}'
    location: swaLocation
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: 'st${take(appName, 9)}${take(suffix, 13)}'
    tags: tags
    corsOrigins: concat(['https://${swa.outputs.defaultHostname}'], empty(webDomain) ? [] : ['https://${webDomain}'])
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    appName: appName
    tags: tags
  }
}

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    name: 'kv-${take(appName, 10)}-${take(suffix, 8)}'
    tags: tags
    dataGoKrKey: dataGoKrKey
  }
}

module function 'modules/function.bicep' = {
  name: 'function'
  params: {
    location: location
    appName: appName
    suffix: take(suffix, 6)
    tags: tags
    storageAccountName: storage.outputs.name
    deploymentContainerName: storage.outputs.deploymentContainer
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    keyVaultName: keyvault.outputs.name
    keySecretUri: keyvault.outputs.secretUri
  }
}

module access 'modules/access.bicep' = {
  name: 'access'
  params: {
    storageAccountName: storage.outputs.name
    keyVaultName: keyvault.outputs.name
    functionPrincipalId: function.outputs.principalId
    deployerPrincipalId: deployerPrincipalId
    deployerPrincipalType: deployerPrincipalType
  }
}

module alerts 'modules/alerts.bicep' = {
  name: 'alerts'
  params: {
    appName: appName
    tags: tags
    alertEmail: alertEmail
    storageAccountId: storage.outputs.id
    functionAppId: function.outputs.id
    budgetStartDate: budgetStartDate
  }
}

output storageAccountName string = storage.outputs.name
output webEndpoint string = storage.outputs.webEndpoint
output dataBaseUrl string = storage.outputs.dataBaseUrl
output swaName string = swa.outputs.name
output swaHostname string = swa.outputs.defaultHostname
output functionAppName string = function.outputs.name
output keyVaultName string = keyvault.outputs.name
