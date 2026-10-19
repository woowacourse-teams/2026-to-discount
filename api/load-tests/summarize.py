"""Summarize k6 results without discarding failed executions."""
import argparse
import json
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args()
    rows=[]
    for f in sorted(args.directory.glob('*.summary.json')):
        metrics=json.loads(f.read_text())['metrics']
        for endpoint in ['brands','banners']:
            timing=metrics.get('client_elapsed{endpoint:'+endpoint+'}',{}).get('values',{})
            failure=metrics.get('request_failed{endpoint:'+endpoint+'}',{}).get('values',{})
            rows.append({'stage':f.name.removesuffix('.summary.json'),'endpoint':endpoint,
                'count':timing.get('count'),'p50_ms':timing.get('med'),'p95_ms':timing.get('p(95)'),
                'p99_ms':timing.get('p(99)'),'failure_rate':failure.get('rate'),
                'dropped_iterations':metrics.get('dropped_iterations',{}).get('values',{}).get('count')})
    runs=[json.loads(x) for x in (args.directory/'runs.ndjson').read_text().splitlines()]
    result={'runs':runs,'endpoints':rows}
    (args.directory/'report.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
