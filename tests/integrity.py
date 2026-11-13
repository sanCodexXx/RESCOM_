from pathlib import Path
import json
import sqlite3

db = sqlite3.connect(':memory:')
for path in sorted(Path('drizzle').glob('*.sql')):
    db.executescript(path.read_text())

def record(key, kind, data, space='test'):
    db.execute('INSERT INTO records VALUES(?,?,?,?,?,?)', (key, space, kind, json.dumps(data), '2026-11-02', '2026-11-02'))

def rejects(fn, message):
    db.execute('SAVEPOINT rejected')
    try:
        fn()
    except sqlite3.IntegrityError as e:
        assert message in str(e), str(e)
    else:
        raise AssertionError('Expected the database to reject this change')
    finally:
        db.execute('ROLLBACK TO rejected')
        db.execute('RELEASE rejected')

record('center', 'centers', {'name':'Test center','capacity':2,'status':'Open'})
record('event', 'events', {'name':'Test event'})
family={'centerId':'center','eventId':'event','status':'In center','members':[{'name':'A'},{'name':'B'}]}
record('family','households',family)
rejects(lambda:record('over-capacity','households',{**family,'members':[{'name':'C'}]}),'RESCOM_CAPACITY')
rejects(lambda:db.execute("UPDATE records SET data=? WHERE id='center'",(json.dumps({'capacity':1,'status':'Open'}),)),'RESCOM_CAPACITY')
rejects(lambda:db.execute("UPDATE records SET data=? WHERE id='center'",(json.dumps({'capacity':2,'status':'Closed'}),)),'RESCOM_OCCUPIED')
rejects(lambda:db.execute("DELETE FROM records WHERE id='center'"),'RESCOM_REFERENCE')
rejects(lambda:db.execute("DELETE FROM records WHERE id='event'"),'RESCOM_REFERENCE')
rejects(lambda:record('wrong-workspace','households',family,'other'),'RESCOM_REFERENCE')
rejects(lambda:record('missing-event','households',{**family,'eventId':'missing'}),'RESCOM_REFERENCE')
rejects(lambda:db.execute("UPDATE records SET data=? WHERE id='family'",(json.dumps({**family,'members':[{'name':'A'},{'name':'B'},{'name':'C'}]}),)),'RESCOM_CAPACITY')
db.execute("UPDATE records SET data=? WHERE id='family'",(json.dumps({**family,'status':'Returned home'}),))
record('next-family','households',family)
assert db.execute("SELECT COUNT(*) FROM records WHERE kind='households'").fetchone()[0]==2
rejects(lambda:db.execute("INSERT INTO accounts(id,space,name,email,center_id,created_at) VALUES('bad','other','Test','test@example.invalid','center','2026-11-02')"),'RESCOM_REFERENCE')
db.execute("DELETE FROM records WHERE kind='households'")
db.execute("DELETE FROM records WHERE id='center'")
print('PASS: capacity, occupied centers, references, workspace isolation, update checks, and checkout capacity release')

# D1 commits a write and its retry receipt in one batch.
db.commit()
def write_with_receipt(key, operation, expected):
    with db:
        db.execute("UPDATE records SET updated_at=? WHERE id=? AND updated_at=?", ('new-version', key, expected))
        db.execute(
            """INSERT INTO record_writes(id,account_id,space,kind,record_id,request_hash,saved_at)
               VALUES(?,?,?,?,?,?,CASE WHEN changes()=1 THEN ? END)""",
            (operation, 'staff', 'test', 'events', key, 'payload', 'new-version'),
        )

write_with_receipt('event', 'op-1', '2026-11-02')
assert db.execute("SELECT saved_at FROM record_writes WHERE id='op-1'").fetchone() == ('new-version',)
try:
    write_with_receipt('event', 'op-2', '2026-11-02')
except sqlite3.IntegrityError as error:
    assert 'record_writes.saved_at' in str(error)
else:
    raise AssertionError('Expected stale write to reject the receipt')
assert db.execute("SELECT COUNT(*) FROM record_writes").fetchone() == (1,)

record('report-1', 'reports', {'eventId':'event','reportNumber':1,'status':'Final'})
rejects(lambda:record('report-2', 'reports', {'eventId':'event','reportNumber':2,'status':'Draft'}), 'RESCOM_FINAL_REPORT')
rejects(lambda:db.execute("DELETE FROM records WHERE id='report-1'"), 'RESCOM_FINAL_REPORT')
record('other-event', 'events', {'name':'Other test event'})
record('other-report', 'reports', {'eventId':'other-event','reportNumber':1,'status':'Draft'})
assert db.execute("SELECT COUNT(*) FROM records WHERE kind='reports'").fetchone() == (2,)
print('PASS: atomic retry receipts and event-specific final report locks')
