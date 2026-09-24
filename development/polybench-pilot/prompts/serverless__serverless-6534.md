Wider `logs:CreateLogStream`/`logs:PutLogEvents` permissions in policy for Lambda functions with manual names (v1.45.1)
<!--
1. If you have a question and not a bug report please ask first at http://forum.serverless.com
2. Please check if an issue already exists. This bug may have already been documented
3. Check out and follow our Guidelines: https://github.com/serverless/serverless/blob/master/CONTRIBUTING.md
4. Fill out the whole template so we have a good overview on the issue
5. Do not remove any section of the template. If something is not applicable leave it empty but leave it in the Issue
6. Please follow the template, otherwise we'll have to ask you to update it
-->

# This is a Bug Report

## Description

* What went wrong?

   When a service contains only custom named functions, the policies for `logs:CreateLogStream` and `logs:PutLogEvents` created using v1.45.1 have a wider set of permissions than they previously did with v1.44.1.

   ### Resource access allowed when using v1.44.1

   * `logs:CreateLogStream`:
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-custom-named-fn:*`
   * `logs:PutLogEvents`:
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-custom-named-fn:*:*`


   ### Resource access allowed when using v1.45.1

   * `logs:CreateLogStream`:
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-dev*:*`
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-custom-named-fn:*`
   * `logs:PutLogEvents`:
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-dev*:*:*`
      * `arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/log-group-policy-custom-named-fn:*:*`

* What did you expect should have happened?

   Based on the principle of least privilege, the additional permissions for `/aws/lambda/log-group-policy-dev*` should not have been added to the IAM policy.

* What was the config you used?

   Full source: [log-group-policy.zip](https://github.com/serverless/serverless/files/3296986/log-group-policy.zip)

   ```yaml
   service: log-group-policy

   provider:
      name: aws
      runtime: nodejs8.10

   functions:
      testFunction:
         name: ${self:service}-custom-named-fn
         handler: index.handler
   ```

   #### To compare output between v1.44.1 and v1.45.1

   ```
   unzip log-group-policy.zip
   cd log-group-policy
   echo '{}' > package.json
   npm i serverless@1.44.1
   ./node_modules/.bin/sls package
   cp .serverless/cloudformation-template-update-stack.json cf-update-stack-v1.44.1.json
   npm i serverless@1.45.1
   ./node_modules/.bin/sls package
   cp .serverless/cloudformation-template-update-stack.json cf-update-stack-v1.45.1.json
   diff cf-update-stack-v1.44.1.json cf-update-stack-v1.45.1.json
   ```

Similar or dependent issues:
* #6236 (PR #6240)
* #6212

## Additional Data

* ***Serverless Framework Version you're using***: 1.45.1
* ***Operating System***: macOS 10.14
* ***Stack Trace***: n/a
* ***Provider Error messages***: none



Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 16.20.2 and npm 8.19.4. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
