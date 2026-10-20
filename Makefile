.PHONY: test check start

test:
	node --test

check:
	node --check server.js
	node --check script.js
	node --test

start:
	node server.js
