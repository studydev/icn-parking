param location string
param appName string
param suffix string
param tags object
param storageAccountName string
param deploymentContainerName string
param appInsightsConnectionString string
param keyVaultName string
param keySecretUri string

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${appName}'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { tier: 'FlexConsumption', name: 'FC1' }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-${appName}-${suffix}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: 'SystemAssigned'
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: sa.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'DATA_STORAGE_ACCOUNT_URL', value: sa.properties.primaryEndpoints.blob }
        { name: 'PRIVATE_CONTAINER', value: 'private' }
        { name: 'WEB_CONTAINER', value: '$web' }
        { name: 'DATA_GO_KR_KEY', value: '@Microsoft.KeyVault(SecretUri=${keySecretUri})' }
        { name: 'KEY_VAULT_NAME', value: keyVaultName }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${sa.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: { name: 'python', version: '3.12' }
    }
  }
}

output name string = app.name
output id string = app.id
output principalId string = app.identity.principalId
