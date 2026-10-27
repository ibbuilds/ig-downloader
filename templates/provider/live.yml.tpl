name: __ID__ live resolution

on:
  schedule:
    - cron: '17 7 * * 3'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  configuration:
    runs-on: ubuntu-latest
    steps:
      - run: echo 'Live check requires IGD___ENV___TEST_URL; an unconfigured live job is skipped, not verified.'

  live:
    name: __ID__ / Live
    if: ${{ vars.IGD___ENV___TEST_URL != '' }}
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/check-provider-live.js __ID__
        env:
          IGD_LIVE_URL: ${{ vars.IGD___ENV___TEST_URL }}
          IG_COOKIE: ${{ secrets.IGD___ENV___COOKIE }}
