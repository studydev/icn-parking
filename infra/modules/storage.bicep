param location string
param name string
param tags object

@description('Origins (https://host) allowed to read the public data with CORS.')
param corsOrigins array = []

var deploymentContainer = 'deploymentpackage'

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Required so the $web container can be read anonymously through the blob endpoint (the only
    // endpoint that officially supports CORS). Every other container stays publicAccess: None.
    allowBlobPublicAccess: true
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blob 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: sa
  name: 'default'
  properties: {
    // Anonymous requests carry no x-ms-version; use a modern version instead of 2009-09-19.
    defaultServiceVersion: '2023-11-03'
    cors: {
      corsRules: empty(corsOrigins) ? [] : [
        {
          allowedOrigins: corsOrigins
          allowedMethods: ['GET', 'HEAD']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource privateContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: 'private'
  properties: { publicAccess: 'None' }
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: deploymentContainer
  properties: { publicAccess: 'None' }
}

// Static website container: public data (data/*.json) + legacy redirect page.
resource webContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blob
  name: '$web'
  properties: { publicAccess: 'Blob' }
}

output name string = sa.name
output id string = sa.id
output deploymentContainer string = deploymentContainer
output webEndpoint string = sa.properties.primaryEndpoints.web
output dataBaseUrl string = '${sa.properties.primaryEndpoints.blob}$web/data/'
