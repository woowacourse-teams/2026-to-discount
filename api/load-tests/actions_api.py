"""Communicate only with the current workflow run. Tokens are never logged."""
import json
import os
import urllib.request


def request(suffix, method='GET'):
    url = (os.environ['GITHUB_API_URL'] + '/repos/' + os.environ['GITHUB_REPOSITORY']
           + '/actions/runs/' + os.environ['GITHUB_RUN_ID'] + suffix)
    req = urllib.request.Request(url, method=method, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=10) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def job(name):
    jobs = request('/jobs?per_page=100')['jobs']
    return next((j for j in jobs if j['name'] == name), None)
