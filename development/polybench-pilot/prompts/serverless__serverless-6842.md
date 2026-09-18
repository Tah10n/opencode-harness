Support NotAction and NotResource
# Feature Proposal

## Description

<!-- Please use https://forum.serverless.com, StackOverflow or other forums for Q&A -->
<!-- Please answer ALL the question below. Otherwise we probably have to close the issue due to missing information -->

Currently Serverless refuses to build if there are iamRoleStatements that contain [`NotAction`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notaction.html) or [`NotResource`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notresource.html).

These should be supported, as they are valid IAM role statements.

e.g. to allow a lambda to send text messages, but not publish to any SNS topics
```yaml
      - Effect: 'Allow'
        Action: 'sns:Publish'
        NotResource: 'arn:aws:sns:*:*:*'
```


Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 16.20.2 and npm 8.19.4. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
