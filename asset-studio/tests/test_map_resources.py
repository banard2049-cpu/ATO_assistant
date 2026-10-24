"""Layered maps round-trip without re-encoding and retain legacy pack support."""
from __future__ import annotations
import hashlib, io, json, tempfile, unittest, zipfile
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from app import map_resources as maps
from app.catalog import CatalogItem, apply_catalog
from app.db import Database
from app.installer import apply_install, install_plan
from app.packages import export_package, export_compat, import_package, inspect_package
from tools.build_fan_pack import build, Reporter
from tests.test_fan_pack import _relax_tempdirs_when_the_sandbox_forbids_0700_dirs

_relax_tempdirs_when_the_sandbox_forbids_0700_dirs()


def write_layer(path, color):
    if path.suffix == '.svg':
        path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg"><path fill="rgb{color[:3]}" d="M0 0h32v32H0z"/></svg>')
    else:
        Image.new('RGBA', (32, 32), color).save(path)


class MapResourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.project=self.root/'project'
        self.project.mkdir();(self.project/'index.html').write_text('ATO',encoding='utf-8')
        for folder in ('aibp','map','story','technology'):(self.project/folder).mkdir()
        self.library=self.root/'library';self.library.mkdir()
        for folder in ('tmp','objects','previews','sources','backups'):(self.library/folder).mkdir()
        self.db=Database(self.library/'library.sqlite3')
        self.front='map/images/c1-tile-001-front.jpg'
        self.back='map/images/c1-tile-001-back.jpg'
        self.item=CatalogItem(id='c1:map:tiles:001',cycle='c1',module='地图板块',subgroup='地图板块',
                              name='板块 001',number='001',sort_order=1,faces={'front':self.front,'back':self.back})
        apply_catalog(self.db,[self.item],{'catalog_version':'test'})
        self.payload={'items':[asdict(self.item)],'source':{'catalog_version':'test'}}
        targets=set(maps.layer_index()['c1-tile-001-front'])|set(maps.layer_index()['c1-tile-001-back'])
        self.files=[]
        for number,target in enumerate(sorted(targets)):
            path=self.project/target;path.parent.mkdir(parents=True,exist_ok=True)
            write_layer(path, (20+number,50,80,128 if '/overlay/' in target else 255))
            self.files.append((target,path))

    def package(self, name='input.atopack', files=None):
        path=self.root/name
        manifest={'format':'ato-asset-pack','version':3,'items':[asdict(self.item)],
                  'assets':[],'stories':{'books':[]}}
        with zipfile.ZipFile(path,'w') as archive:
            maps.add_to_archive(archive,manifest,files=self.files if files is None else files)
            archive.writestr('manifest.json',json.dumps(manifest))
        return path,manifest

    def test_collect_only_registered_dependencies_and_cover_both_legacy_faces(self):
        files=maps.collect(self.project,targets=[self.front,self.back])
        self.assertEqual({p for p,_ in files},{p for p,_ in self.files})
        self.assertEqual(maps.covered_targets(files,[self.front,self.back]),{self.front,self.back})
        (self.project/'map/images/hd1024/base/unused.png').write_bytes(b'not a map')
        self.assertEqual(len(maps.collect(self.project,targets=[self.front,self.back])),4)

    def test_missing_companion_fails_before_pack_build(self):
        next(path for target,path in self.files if '/overlay/' in target).unlink()
        with self.assertRaisesRegex(ValueError,'不完整'):
            maps.collect(self.project,targets=[self.front,self.back])

    def test_c5_only_pack_includes_shared_cover_texture_and_roundtrips(self):
        target = 'map/images/c5-tile-080-front.png'
        paths = set(maps.layer_index()['c5-tile-080-front']) | set(maps.cover_index()['c5-tile-080-front'])
        for filename in paths:
            dest = self.project / filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            write_layer(dest, (20, 50, 80, 255))
        files = maps.collect(self.project, targets=iter([target]))
        self.assertEqual({name for name, _ in files}, paths)
        package, manifest = self.package('c5-only.atopack', files=files)
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(len(maps.validate(archive, manifest)), 4)

    def test_partial_cycle_library_does_not_require_unimported_cycles(self):
        package,_=self.package();import_package(self.db,self.library,package)
        files=maps.collect(None,self.library,targets=[self.front,self.back,
            'map/images/c2-tile-001-front.png','map/images/c2-tile-001-back.png'])
        self.assertEqual({target for target,_ in files},{target for target,_ in self.files})

    def test_c23_shared_and_legacy_bases_both_import_but_missing_base_fails(self):
        for cycle in ('c2', 'c3'):
            targets = maps.layer_index()[f'{cycle}-tile-001-back']
            self.assertIn('map/images/card-backs/c1-base.png', targets)
            for shared in (True, False):
                files = []
                for target in targets:
                    if not shared and target == 'map/images/card-backs/c1-base.png':
                        target = f'map/images/card-backs/{cycle}-base.png'
                    path = self.project / target
                    path.parent.mkdir(parents=True, exist_ok=True)
                    write_layer(path, (20,50,80,255))
                    files.append((target, path))
                package, manifest = self.package(f'{cycle}-{shared}.atopack', files=files)
                with zipfile.ZipFile(package) as archive:
                    self.assertEqual(len(maps.validate(archive, manifest)), len(files))
                masks = [(target,path) for target,path in files if '/numbers/' in target or '/vectors/' in target]
                package, manifest = self.package(f'{cycle}-mask-only.atopack', files=masks)
                with zipfile.ZipFile(package) as archive, self.assertRaisesRegex(ValueError, '配套底图'):
                    maps.validate(archive, manifest)

    def test_studio_import_install_export_roundtrip_preserves_exact_png_bytes(self):
        package,manifest=self.package()
        inspected=inspect_package(self.db,package,True,library=self.library)
        self.assertEqual(inspected['map_summary'],{'add':4,'same':0,'replace':0})
        imported=import_package(self.db,self.library,package)
        self.assertEqual(imported['map_imported'],4)
        destination=self.root/'installed';destination.mkdir();(destination/'index.html').write_text('ATO')
        for name in ('aibp','map','story'):(destination/name).mkdir()
        plan=install_plan(self.db,self.library,destination)
        self.assertEqual({entry['target'] for entry in plan['files']},{target for target,_ in self.files})
        self.assertEqual(apply_install(self.db,self.library,destination,[])['installed'],4)
        for target,source in self.files:self.assertEqual((destination/target).read_bytes(),source.read_bytes())
        output=self.root/'roundtrip.atopack'
        result=export_package(self.db,self.library,output,{'include_stories':False,'complete_only':True})
        self.assertEqual(result['map_files'],4)
        with zipfile.ZipFile(output) as archive:
            exported=json.loads(archive.read('manifest.json'))
            self.assertEqual(len(exported['mapFiles']),4)
            self.assertEqual(exported['assets'],[])
            for target,source in self.files:self.assertEqual(archive.read(target),source.read_bytes())
        compat=self.root/'compat.zip'
        self.assertEqual(export_compat(self.db,self.library,compat,{'include_stories':False})['map_files'],4)

    def test_studio_reports_map_conflicts_and_keeps_existing_without_replace(self):
        package,_=self.package();import_package(self.db,self.library,package)
        target,path=self.files[0];stored=self.library/maps.LIBRARY/target
        original=stored.read_bytes();write_layer(path, (220,0,0,255))
        package,_=self.package('updated.atopack')
        self.assertEqual(inspect_package(self.db,package,library=self.library)['map_summary']['replace'],1)
        import_package(self.db,self.library,package,replace=False);self.assertEqual(stored.read_bytes(),original)
        import_package(self.db,self.library,package,replace=True);self.assertEqual(stored.read_bytes(),path.read_bytes())

    def test_corrupt_or_incomplete_map_set_is_rejected_before_library_write(self):
        package,manifest=self.package()
        for mutation in ('hash','missing','duplicate','path','instruction'):
            broken=json.loads(json.dumps(manifest));members={target:path.read_bytes() for target,path in self.files}
            if mutation=='hash':broken['mapFiles'][0]['sha256']='0'*64
            elif mutation=='missing':broken['mapFiles']=[x for x in broken['mapFiles'] if '/overlay/' not in x['target']]
            elif mutation=='duplicate':broken['mapFiles'].append(broken['mapFiles'][0])
            elif mutation=='path':broken['mapFiles'][0]['target']='map/app.js'
            else:
                target='map/images/card-backs/numbers/c1-tile-009-alt-back.png';raw=next(iter(members.values()))
                members[target]=raw;broken['mapFiles'].append({'target':target,'member':target,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
            bad=self.root/(mutation+'.atopack')
            with zipfile.ZipFile(bad,'w') as archive:
                for name,raw in members.items():archive.writestr(name,raw)
                archive.writestr('manifest.json',json.dumps(broken))
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):
                import_package(self.db,self.library,bad)
            self.assertFalse((self.library/maps.LIBRARY).exists())

    def test_cli_keeps_masks_raw_even_when_other_images_are_reencoded(self):
        output=self.root/'cli.atopack'
        with patch('tools.build_fan_pack.fixed_catalog_payload',return_value=self.payload):
            result=build(ato_root=self.project,output=output,library_path=None,cycles=[],modules=[],
                         complete_only=True,include_story_data=False,include_story_files=False,
                         include_bgm=False,include_icons=False,include_cryptic=False,include_mixed_media=False,
                         official_story=False,official_scans=False,official_assets=False,skip_missing=False,
                         force=False,dry_run=False,compression_name='store',verify_mode='full',verify_sample=32,
                         reporter=Reporter(quiet=True),image_quality=85)
        self.assertEqual(result.map_files,4);self.assertEqual(result.faces_without_asset,0)
        with zipfile.ZipFile(output) as archive:
            doc=json.loads(archive.read('manifest.json'));self.assertEqual(doc['assets'],[])
            for target,path in self.files:self.assertEqual(archive.read(target),path.read_bytes())

    def test_old_scan_only_pack_still_imports_and_installs(self):
        raw=io.BytesIO();Image.new('RGB',(32,32),'red').save(raw,format='JPEG');data=raw.getvalue()
        package=self.root/'legacy.atopack';item={**asdict(self.item),'faces':{'front':self.front}}
        doc={'format':'ato-asset-pack','version':3,'items':[item],'assets':[{'itemId':self.item.id,
             'face':'front','member':self.front,'sha256':hashlib.sha256(data).hexdigest(),'mimeType':'image/jpeg'}],
             'stories':{'books':[]}}
        with zipfile.ZipFile(package,'w') as archive:
            archive.writestr(self.front,data);archive.writestr('manifest.json',json.dumps(doc))
        self.assertEqual(import_package(self.db,self.library,package)['imported'],1)
        plan=install_plan(self.db,self.library,self.project)
        self.assertEqual([row['target'] for row in plan['files']],[self.front])

    def test_legacy_png_layers_still_import_and_reexport(self):
        files = []
        for stem in ('c1-tile-001-front', 'c1-tile-001-back'):
            for target in maps.legacy_index()[stem]:
                path = self.root / 'old' / target
                path.parent.mkdir(parents=True, exist_ok=True)
                write_layer(path, (50, 70, 90, 255))
                files.append((target, path))
        package, manifest = self.package('old-layers.atopack', files=files)
        self.assertEqual(import_package(self.db, self.library, package)['map_imported'], 4)
        collected = maps.collect(None, self.library, targets=[self.front, self.back])
        self.assertEqual({p for p, _ in collected}, {p for p, _ in files})
        self.assertEqual(maps.covered_targets(collected, [self.front, self.back]), {self.front, self.back})

    def test_svg_mime_and_hash_are_preserved_and_missing_base_is_rejected(self):
        package, manifest = self.package()
        vectors = [entry for entry in manifest['mapFiles'] if entry['target'].endswith('.svg')]
        self.assertEqual(len(vectors), 2)
        self.assertTrue(all(entry['mimeType'] == 'image/svg+xml' for entry in vectors))
        with zipfile.ZipFile(package) as archive:
            maps.validate(archive, manifest)
            broken = json.loads(json.dumps(manifest))
            broken['mapFiles'] = [entry for entry in broken['mapFiles'] if '/base/' not in entry['target']]
            with self.assertRaisesRegex(ValueError, '配套底图'):
                maps.validate(archive, broken)

    def test_c4_masks_roundtrip_and_require_their_own_shared_base(self):
        legacy = 'map/images/c4-tile-011-back.png'
        targets = maps.layer_index()['c4-tile-011-back']
        self.assertEqual(len(targets), 2)
        self.files = []
        for target in targets:
            path = self.project / target
            path.parent.mkdir(parents=True, exist_ok=True)
            write_layer(path, (80, 65, 40, 128))
            self.files.append((target, path))
        collected = maps.collect(self.project, targets=[legacy])
        self.assertEqual({p for p, _ in collected}, set(targets))
        self.assertEqual(maps.covered_targets(collected, [legacy]), {legacy})
        package, _ = self.package('c4.atopack')
        self.assertEqual(import_package(self.db, self.library, package)['map_imported'], 2)
        for target, path in self.files:
            self.assertEqual((self.library / maps.LIBRARY / target).read_bytes(), path.read_bytes())
        package, _ = self.package('c4-mask-only.atopack', files=[self.files[1]])
        with self.assertRaisesRegex(ValueError, '配套底图'):
            import_package(self.db, self.library, package)
        self.files[1][1].unlink()
        # A shared base without a face-specific mask permits legacy fallback.
        self.assertEqual(maps.collect(self.project, targets=[legacy]), [])


if __name__=='__main__':unittest.main()
