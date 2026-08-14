#!/usr/bin/env bash

set -euo pipefail

output_file="${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
event_name="${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required}"
schedule_cron="${SCHEDULE_CRON:-}"
diagnostics_only="${DIAGNOSTICS_ONLY:-false}"

echo "source_sha=$(git rev-parse HEAD)" >> "$output_file"

case "$event_name" in
  workflow_dispatch)
    echo "should_refresh=true" >> "$output_file"
    echo "should_run=true" >> "$output_file"
    [[ "$diagnostics_only" == "true" ]] && echo "should_deploy=false" >> "$output_file" || echo "should_deploy=true" >> "$output_file"
    exit 0
    ;;
  push)
    echo "should_refresh=false" >> "$output_file"
    echo "should_run=true" >> "$output_file"
    echo "should_deploy=true" >> "$output_file"
    exit 0
    ;;
  schedule) ;;
  *)
    echo "::error title=Unsupported workflow event::Cannot determine refresh path for ${event_name}."
    exit 1
    ;;
esac

eastern_offset="${EASTERN_UTC_OFFSET:-$(TZ=America/New_York date +%z)}"
case "${eastern_offset}:${schedule_cron}" in
  -0400:"0 16 * * 1,4"|-0400:"31 22 * * 2"|-0500:"0 17 * * 1,4"|-0500:"31 23 * * 2")
    echo "should_refresh=true" >> "$output_file"
    echo "should_run=true" >> "$output_file"
    echo "should_deploy=true" >> "$output_file"
    echo "Accepting scheduled refresh cron '${schedule_cron}' for Eastern offset ${eastern_offset}."
    ;;
  -0400:"0 17 * * 1,4"|-0400:"31 23 * * 2"|-0500:"0 16 * * 1,4"|-0500:"31 22 * * 2")
    echo "should_refresh=false" >> "$output_file"
    echo "should_run=false" >> "$output_file"
    echo "should_deploy=false" >> "$output_file"
    echo "Skipping alternate DST cron '${schedule_cron}' for Eastern offset ${eastern_offset}."
    ;;
  *)
    echo "::error title=Unknown scheduled refresh::cron='${schedule_cron}' offset='${eastern_offset}'"
    exit 1
    ;;
esac
