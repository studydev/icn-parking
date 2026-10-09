param location string
param name string
param tags object

@secure()
param dataGoKrKey string

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'data-go-kr-key'
  properties: { value: dataGoKrKey }
}

output name string = kv.name
output secretUri string = '${kv.properties.vaultUri}secrets/${secret.name}/'
