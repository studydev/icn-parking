param appName string
param tags object
param alertEmail string
param storageAccountId string
param functionAppId string
param budgetStartDate string

resource ag 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${appName}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take('icnpark', 12)
    enabled: true
    emailReceivers: [
      { name: 'owner', emailAddress: alertEmail, useCommonAlertSchema: true }
    ]
  }
}

// obs/*.jsonl is the only AppendBlock writer: no successful appends in 15 minutes = data stopped (app down or API failing).
// Storage reports 0 (not "no data") for empty intervals, so LessThan 1 fires on absence.
resource ingestStopped 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${appName}-ingest-stopped'
  location: 'global'
  tags: tags
  properties: {
    description: 'No AppendBlock on obs/ for 15 minutes (collect stopped or API failing).'
    severity: 2
    enabled: true
    scopes: [storageAccountId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'appendBlock'
          metricNamespace: 'Microsoft.Storage/storageAccounts'
          metricName: 'Transactions'
          dimensions: [
            { name: 'ApiName', operator: 'Include', values: ['AppendBlock'] }
            { name: 'ResponseType', operator: 'Include', values: ['Success'] }
          ]
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Total'
          skipMetricValidation: true
        }
      ]
    }
    actions: [{ actionGroupId: ag.id }]
  }
}

resource appIdle 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${appName}-app-idle'
  location: 'global'
  tags: tags
  properties: {
    description: 'Fewer than 3 function executions in 30 minutes (timer not firing; 6+ expected).'
    severity: 2
    enabled: true
    scopes: [functionAppId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT30M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'executions'
          metricNamespace: 'Microsoft.Web/sites'
          metricName: 'OnDemandFunctionExecutionCount'
          operator: 'LessThan'
          threshold: 3
          timeAggregation: 'Total'
          skipMetricValidation: true
        }
      ]
    }
    actions: [{ actionGroupId: ag.id }]
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'budget-${appName}'
  properties: {
    category: 'Cost'
    amount: 10
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      actual5: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [alertEmail]
      }
      actual10: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [alertEmail]
      }
    }
  }
}
