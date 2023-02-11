# dynamodb-local-shareddb-bug

Previously, when not using `-sharedDb` and when using `-inMemory`, DynamoDB Local would keep databases separate. This was really useful for having things like isolation in tests.

However, since late 2022 there appears to be a bug in DynamoDB Local which means the databases are not kept separate.

This repository acts as a reproduction of the bug, and can automatically check whether the bug is still present.
