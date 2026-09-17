Add option to set unix socket permissions
Hello,

when using the --socket option, I can tell code-server which socket to use, but not the permissions. At the moment the default permissions are 0755, which means that only the user is able to write to the socket while it's world readable...

When running together with a web server, it'd be nice if it could be set to 0770 and giving the group name/id so that a common group between web server and code-server would be possible.

Something like:

--socket /var/run/code-server.sock,0770,user,group
--socket /var/run/code-server.sock,0770,,group

Also, the server doesn't clean up the socket when it goes down and on a restart it errors out with address already in use...

I'm using workarounds at the moment, but it would be better if code-server could take care of it on its own.




Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 14.21.3 and npm 6.14.18. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
