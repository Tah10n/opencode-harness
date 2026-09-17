Function event configuration can't be moved to a separate file anymore
# This is a Bug Report
## Description

We used to be able to specify a "file variable" for function event configuration, which was quite useful for a service with multiple handlers. This allowed each handler to be in their own directory, along with the event configuration. This looked something like this:

```
functions:
  users:
    handler: handlers/users/handler.users
    events: ${file(./handlers/users/config.yml):events}
```

The `config.yml` file would contain a valid event configuration.

I'm not sure exactly when this started but using the same configuration I can no longer use variables for event configurations and instead get the following error:

`Events for "users" must be an array, not an string`

The event configuration should have loaded properly as it used to
## Workaround

If I comment out the following lines from the `./lib/classes/Service.js` file everything works as expected, but I'm not sure of the impact of removing those lines. They must be there for a reason:

```
if (!_.isArray(functionObj.events)) {
   throw new SError(`Events for "${functionName}" must be an array,` +
                    ` not an ${typeof functionObj.events}`);
 }
```

I'd be happy to submit a PR to fix this, but I'm not sure what the best approach would be. Removing those lines would work, but then this opens the door for a bunch of validation issues and potential errors.

What do you think?
## Additional Data
- **_Serverless Framework Version you're using**_: 1.0.2
- **_Operating System**_: Windows 10
- **_Stack Trace**_: N/A
- **_Provider Error messages**_: N/A



Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 16.20.2 and npm 8.19.4. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
