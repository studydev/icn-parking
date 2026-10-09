param storageAccountName string
param keyVaultName string
param functionPrincipalId string
param deployerPrincipalId string
param deployerPrincipalType string

var blobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var blobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var kvSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource fnBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sa.id, functionPrincipalId, blobDataOwner)
  scope: sa
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataOwner)
  }
}

resource fnKv 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, functionPrincipalId, kvSecretsUser)
  scope: kv
  properties: {
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUser)
  }
}

resource deployerBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  name: guid(sa.id, deployerPrincipalId, blobDataContributor)
  scope: sa
  properties: {
    principalId: deployerPrincipalId
    principalType: deployerPrincipalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
  }
}
