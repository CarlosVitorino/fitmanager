// Integration tests run against TEST_DATABASE_URL, never the development database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://fitmanager:fitmanager@localhost:5432/fitmanager_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:4321";
process.env.NODE_ENV = "test";
