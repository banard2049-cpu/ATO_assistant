"""Exercise real restore requests against a disposable PHP server and saves."""
import json
import unittest
import uuid

import test_lan_account_guard as fixtures


class PreviousDayRestoreTest(unittest.TestCase):
    setUpClass = classmethod(fixtures.AccountGuardTest.setUpClass.__func__)
    cleanup_files = classmethod(fixtures.AccountGuardTest.cleanup_files.__func__)
    stop_server = classmethod(fixtures.AccountGuardTest.stop_server.__func__)
    request = classmethod(fixtures.AccountGuardTest.request.__func__)

    def setUp(self):
        self.account = 'restore_' + uuid.uuid4().hex[:12]
        status, _ = self.request('?action=register', {
            'username': self.account, 'password': 'fixture-only',
        })
        self.assertEqual(status, 200)

    def dashboard(self, day, note=''):
        return {'activeProfileId': 'p', 'profiles': {'p': {
            'activeCycleId': 'c2', 'cycles': {'c2': {'state': {'day': day, 'notes': note}}},
        }}}

    def save(self, section, state):
        status, body = self.request(payload={'section': section, 'state': state})
        self.assertEqual(status, 200, body)

    def campaign(self):
        return self.request()[1]['campaign']

    def restore(self, day, **overrides):
        campaign = self.campaign()
        current = campaign['sections']['dashboard']['profiles']['p']['cycles']['c2']['state']['day']
        payload = {'expectedAccountId': self.account,
                   'expectedRevision': campaign['sectionRevisions']['dashboard'],
                   'profileId': 'p', 'cycleId': 'c2', 'currentDay': str(current), 'day': str(day)}
        payload.update(overrides)
        return self.request('?action=restore-previous-day', payload)

    def test_full_restore_preserves_current_backup_and_rejects_stale_writes(self):
        sections = ['map', 'record', 'technology', 'heroes', 'aibp', 'story']
        self.save('dashboard', self.dashboard(1, 'previous'))
        for section in sections:
            self.save(section, {'value': section + '-previous'})
        previous = self.campaign()
        self.save('dashboard', self.dashboard(2, 'today'))
        for section in sections:
            self.save(section, {'value': section + '-today'})
        before = self.campaign()
        status, result = self.restore(1)
        self.assertEqual(status, 200, result)
        self.assertEqual(result['campaign']['sections'], previous['sections'])
        for section, revision in before['sectionRevisions'].items():
            self.assertEqual(result['campaign']['sectionRevisions'][section], revision + 1)
        status, result = self.request(payload={
            'section': 'map', 'state': {'value': 'stale'},
            'expectedRevision': before['sectionRevisions']['map'],
        })
        self.assertEqual((status, result['code']), (409, 'SAVE_CONFLICT'))
        snapshots = []
        for file in (self.root / 'data' / 'backups' / self.account).rglob('*.json'):
            snapshots.append(json.loads(file.read_text(encoding='utf-8')))
        self.assertTrue(any(item.get('sections') == before['sections'] for item in snapshots))

    def test_missing_or_invalid_backup_does_not_change_save(self):
        self.save('dashboard', self.dashboard(4))
        self.save('dashboard', self.dashboard(5))
        before = self.campaign()
        for file in (self.root / 'data' / 'backups' / self.account / 'daily').rglob('*.json'):
            file.write_text('{broken', encoding='utf-8')
        for day in (3, 4):
            status, body = self.restore(day)
            self.assertEqual((status, body['code']), (404, 'BACKUP_NOT_FOUND'))
            self.assertEqual(self.campaign(), before)

    def test_identity_and_revision_conflicts_do_not_restore(self):
        self.save('dashboard', self.dashboard(1))
        self.save('dashboard', self.dashboard(2))
        before = self.campaign()
        for change, code in [({'expectedAccountId': 'other'}, 'ACCOUNT_MISMATCH'),
                             ({'expectedRevision': 0}, 'SAVE_CONFLICT'),
                             ({'cycleId': 'c1'}, 'SAVE_CONFLICT'),
                             ({'profileId': 'other'}, 'SAVE_CONFLICT'),
                             ({'currentDay': '3'}, 'SAVE_CONFLICT')]:
            status, body = self.restore(1, **change)
            self.assertEqual((status, body['code']), (409, code))
            self.assertEqual(self.campaign(), before)

    def test_repeated_visits_use_latest_backup_and_can_continue_backwards(self):
        self.save('dashboard', self.dashboard(0, 'zero'))
        self.save('dashboard', self.dashboard(1, 'first visit'))
        self.save('dashboard', self.dashboard(2))
        self.assertEqual(self.restore(1)[0], 200)
        self.save('dashboard', self.dashboard(1, 'second visit'))
        self.save('dashboard', self.dashboard(2))
        status, body = self.restore(1)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['campaign']['sections']['dashboard'], self.dashboard(1, 'second visit'))
        status, body = self.restore(0)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['campaign']['sections']['dashboard'], self.dashboard(0, 'zero'))

    def test_named_day_and_method(self):
        self.save('dashboard', self.dashboard('10a'))
        self.save('dashboard', self.dashboard('10b'))
        self.assertEqual(self.request('?action=restore-previous-day')[0], 405)
        status, body = self.restore('10a')
        self.assertEqual(status, 200, body)
        self.assertEqual(body['campaign']['sections']['dashboard'], self.dashboard('10a'))

    def test_failed_restore_releases_lock_so_later_saves_work(self):
        self.save('dashboard', self.dashboard(1, 'keep'))
        self.save('dashboard', self.dashboard(2, 'today'))
        before = self.campaign()
        status, body = self.restore(3)
        self.assertEqual((status, body['code']), (404, 'BACKUP_NOT_FOUND'))
        status, saved = self.request(payload={
            'section': 'dashboard',
            'state': self.dashboard(2, 'after failed restore'),
            'expectedRevision': before['sectionRevisions']['dashboard'],
            'expectedAccountId': self.account,
        })
        self.assertEqual(status, 200, saved)
        self.assertEqual(saved['revision'], before['sectionRevisions']['dashboard'] + 1)


if __name__ == '__main__':
    unittest.main()
