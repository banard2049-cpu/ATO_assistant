"""Real PHP save tests with disposable accounts and an isolated data directory."""
import unittest
import test_lan_account_guard as fixtures


class CampaignNotesTest(unittest.TestCase):
    setUpClass = classmethod(fixtures.AccountGuardTest.setUpClass.__func__)
    cleanup_files = classmethod(fixtures.AccountGuardTest.cleanup_files.__func__)
    stop_server = classmethod(fixtures.AccountGuardTest.stop_server.__func__)
    request = classmethod(fixtures.AccountGuardTest.request.__func__)

    def setUp(self):
        self.request('?action=login', {'username': 'audit_alpha', 'password': 'fixture-only'})
        self.request(payload={'section': 'dashboard', 'state': {'activeProfileId': 'B', 'profiles': {
            'A': {'activeCycleId': 'c2', 'cycles': {'c2': {'state': {'day': 7, 'notes': '手写内容'}}}},
            'B': {'activeCycleId': 'c1', 'cycles': {'c1': {'state': {'notes': '另一档案'}}}},
        }}})
        self.request(payload={'section': 'record', 'userId': 'A', 'state': {'resources': {'trireme': 1}}})
        _, before = self.request()
        self.before = before['campaign']

    def save(self, **changes):
        payload = {'section': 'record', 'userId': 'A', 'state': {'resources': {'trireme': 2}},
                   'expectedRevision': self.before['sectionRevisions']['record'], 'expectedAccountId': 'audit_alpha',
                   'campaignNotes': {'profileId': 'A', 'entries': [{'cycleId': 'c2', 'source': '记录表', 'text': '船材 1 → 2'}]}}
        payload.update(changes)
        return self.request(payload=payload)

    def test_atomic_write_preserves_notes_profile_and_revision(self):
        self.assertEqual(self.save()[0], 200)
        _, after = self.request()
        campaign = after['campaign']
        notes = campaign['sections']['dashboard']['profiles']['A']['cycles']['c2']['state']['notes']
        self.assertTrue(notes.startswith('手写内容\n['))
        self.assertIn('C2 第7天 · 记录表] 船材 1 → 2', notes)
        self.assertEqual(campaign['sections']['record']['users']['A']['resources']['trireme'], 2)
        self.assertEqual(campaign['sections']['dashboard']['profiles']['B']['cycles']['c1']['state']['notes'], '另一档案')
        self.assertEqual(campaign['sectionRevisions']['dashboard'], self.before['sectionRevisions']['dashboard'] + 1)
        self.assertEqual(self.save()[0], 409)
        _, retry = self.request()
        self.assertEqual(retry['campaign'], campaign)

    def test_conflict_bad_entry_and_changed_account_write_neither_section(self):
        invalid = {'profileId': 'A', 'entries': [{'cycleId': 'c2', 'source': '记录表', 'text': '有效'},
                                               {'cycleId': 'wrong', 'source': '记录表', 'text': '无效'}]}
        for changes, status in [({'expectedRevision': -1}, 409), ({'expectedAccountId': 'audit_bravo'}, 409),
                                ({'campaignNotes': invalid}, 400),
                                ({'campaignNotes': {'profileId': 'missing', 'entries': []}}, 400)]:
            self.assertEqual(self.save(**changes)[0], status)
            _, after = self.request()
            self.assertEqual(after['campaign'], self.before)

    def test_multiple_cycles_and_simultaneous_dashboard_edit_are_preserved(self):
        dashboard = self.before['sections']['dashboard']
        dashboard['profiles']['A']['cycles']['c2']['state']['notes'] = '刚编辑的笔记'
        self.request(payload={'section': 'dashboard', 'state': dashboard})
        self.assertEqual(self.save(campaignNotes={'profileId': 'A', 'entries': [
            {'cycleId': 'c1', 'source': '英雄', 'text': '回忆突破'},
            {'cycleId': 'c2', 'source': '科技', 'text': '制造装备'},
        ]})[0], 200)
        _, after = self.request()
        cycles = after['campaign']['sections']['dashboard']['profiles']['A']['cycles']
        self.assertIn('回忆突破', cycles['c1']['state']['notes'])
        self.assertTrue(cycles['c2']['state']['notes'].startswith('刚编辑的笔记\n'))

    def test_all_module_sections_append_without_truncating_handwritten_notes(self):
        dashboard = self.before['sections']['dashboard']
        original = '长笔记' * 3000
        dashboard['profiles']['A']['cycles']['c2']['state']['notes'] = original
        self.request(payload={'section': 'dashboard', 'state': dashboard})
        for section in ['record', 'technology', 'heroes', 'aibp', 'story']:
            _, current = self.request()
            status, _ = self.save(section=section, userId='A' if section in ['record', 'technology'] else '',
                                  expectedRevision=current['campaign']['sectionRevisions'][section],
                                  campaignNotes={'profileId': 'A', 'entries': [
                                      {'cycleId': 'c2', 'source': section, 'text': section + ' event'}]})
            self.assertEqual(status, 200)
        _, after = self.request()
        notes = after['campaign']['sections']['dashboard']['profiles']['A']['cycles']['c2']['state']['notes']
        self.assertTrue(notes.startswith(original + '\n'))
        for section in ['record', 'technology', 'heroes', 'aibp', 'story']:
            self.assertEqual(notes.count(section + ' event'), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
