#!/bin/sh
set -eu

mkdir -p /deployments
chown -R node:node /deployments

exec su-exec node "$@"
