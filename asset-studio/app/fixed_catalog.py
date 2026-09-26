"""Built-in physical component manifest generated from ATO Local 0.2.11.

This compressed payload contains metadata only: labels, identifiers, grouping and
target paths. It intentionally contains no image bytes, story text or audio.
"""
from __future__ import annotations

import base64
import gzip
import json
from pathlib import Path
from typing import Any

from .catalog import (
    AIBP_CYCLES,
    AIBP_NAMES,
    AIBP_TOKEN_LABELS,
    HERO_RECORD_ICONS,
    MAP_TOKEN_LABELS,
    CatalogItem,
    TITAN_IMAGE_LABELS,
    apply_catalog,
    component_display_name,
    make_id,
    simple_group_id_number,
)
from .db import Database


BATTLE_TERRAIN_PIECES = (
    ("Abandoned Temple", "abandoned-temple.jpg", None),
    ("Ambrosia Pool", "ambrosia-pool.jpg", None),
    ("Ambrosia Trail", "ambrosia-trail.jpg", None),
    ("Ambrosia Elephant", "ambrosia-elephant.jpg", None),
    ("Ambrosia Cloud", "ambrosia-cloud.jpg", None),
    ("Blue Anchor", "anchor-blue.jpg", None),
    ("Green Anchor", "anchor-green.jpg", None),
    ("Red Anchor", "anchor-red.jpg", None),
    ("Yellow Anchor", "anchor-yellow.png", None),
    ("Argo Hull 1x4", "argo-hull-1x4.jpg", None),
    ("Argo Hull 1x5", "argo-hull-1x5.jpg", "argo-hull-1x5-back.jpg"),
    ("Black Glacier 1x5", "black-glacier-1x5.jpg", None),
    ("Black Glacier L", "black-glacier-l.png", None),
    ("Black Glacier Z", "black-glacier-z.png", None),
    ("Black Iceberg", "black-iceberg.jpg", None),
    ("Black Lake", "black-lake.jpg", None),
    ("Black Abyss", "black-abyss.jpg", None),
    ("Arcology", "arcology.jpg", "arcology-back.jpg"),
    ("City", "city.jpg", "ruined-city.jpg"),
    ("Cliff I", "cliff-i.jpg", None),
    ("Cliff L", "cliff-l.png", None),
    ("Cliff O", "cliff-o.jpg", None),
    ("Cliff Z", "cliff-z.png", None),
    ("Column", "column.jpg", None),
    ("Cyclops Trap", "cyclops-trap.jpg", None),
    ("Endless Staircase Track 1 1x5", "endless-staircase-track-1-1x5.jpg", None),
    ("Endless Staircase Track 2 1x4", "endless-staircase-track-2-1x4.jpg", None),
    ("Endless Staircase Track 3 1x4", "endless-staircase-track-3-1x4.jpg", None),
    ("Endless Staircase Track 4 1x5", "endless-staircase-track-4-1x5.jpg", None),
    ("Floating Rocks", "floating-rocks.jpg", None),
    ("Fortified City", "fortified-city.jpg", "termophylaed-city.jpg"),
    ("Giant Shell", "giant-shell.jpg", None),
    ("Giant Black Iceberg", "giant-black-iceberg.jpg", None),
    ("Graveyard Of The Frail", "graveyard-of-the-frail.jpg", None),
    ("Hyperborean Ruins", "hyperborean-ruins.jpg", None),
    ("Inkblot", "inkblot.jpg", None),
    ("Irem City", "irem-city.jpg", None),
    ("Irem Tower", "irem-tower.jpg", None),
    ("Krypteia Outpost", "krypteia-outpost.jpg", "damaged-krypteia-outpost.jpg"),
    ("Labyrinth I", "labyrinth-i.jpg", None),
    ("Labyrinth L", "labyrinth-l.png", None),
    ("Labyrinth O", "labyrinth-o.jpg", None),
    ("Labyrinth Z", "labyrinth-z.png", None),
    ("Lightwall 1x1", "lightwall-1x1.jpg", None),
    ("Lightwall 1x4", "lightwall-1x4.jpg", None),
    ("Lightwall 1x5", "lightwall-1x5.jpg", None),
    ("Maze Fissure I", "maze-fissure-i.jpg", None),
    ("Maze Fissure L", "maze-fissure-l.png", None),
    ("Maze Fissure O", "maze-fissure-o.jpg", None),
    ("Maze Fissure Z", "maze-fissure-z.png", None),
    ("Maze Outcrop", "maze-outcrop.jpg", None),
    ("Minos Manos Unit", "minos-manos-unit.jpg", None),
    ("Petrified Vent", "petrified-vent.jpg", None),
    ("School Of Creatures", "school-of-creatures.jpg", None),
    ("Spartan River Works Z", "spartan-river-works-z.png", None),
    ("Spartan River Works 1x1 Corner", "spartan-river-works-corner.jpg", None),
    ("Spartan River Works 1x1 End", "spartan-river-works-end.jpg", None),
    ("Spartan River Works 1x4", "spartan-river-works-1x4.jpg", None),
    ("Spartan River Works 1x5", "spartan-river-works-1x5.jpg", None),
    ("Spot of Nothingness", "spot-of-nothingness.jpg", None),
    ("Staircase Entrance", "staircase-entrance.jpg", None),
    ("Time-Frozen City", "time-frozen-city.jpg", None),
    ("Timefront 1x4", "timefront-1x4.jpg", "timefront-1x4-back.jpg"),
    ("Timefront 1x5", "timefront-1x5.jpg", None),
    ("Track Tile 1x1", "track-tile-1x1.jpg", None),
    ("Track Tile 1x2", "track-tile-1x2.jpg", None),
    ("Track Tile 1x5", "track-tile-1x5.jpg", None),
    ("Track Tile 1 1x5", "track-tile-1-1x5.jpg", None),
    ("Track Tile 2 1x4", "track-tile-2-1x4.jpg", None),
    ("Track Tile 3 1x4", "track-tile-3-1x4.jpg", None),
    ("Track Tile 4 1x5", "track-tile-4-1x5.jpg", None),
    ("Trench Left 1x1", "trench-left-1x1.jpg", None),
    ("Trench Right 1x1", "trench-right-1x1.jpg", None),
    ("Trench 1x4", "trench-1x4.jpg", None),
    ("Trench 1x5", "trench-1x5.jpg", None),
    ("Trireme Graveyard", "trireme-graveyard.jpg", None),
    ("Windblighted Fleet", "windblighted-fleet.jpg", None),
    ("Wishstorm", "wishstorm.jpg", None),
)

CYCLE_TRAIT_CARDS = (
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_001", "Bleak Outlook"),
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_002", "Abundance Has Impoverished You"),
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_003", "You Will Never Win"),
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_004", "Reap the Ashes"),
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_005", "Inverted Battle"),
    ("c4", "C4 Cursed Trait", "C4_CURSED_TR_006", "Years to Rust"),
    ("c5", "C5 Trait", "C5_TR_001", "Quantum Eye"),
    ("c5", "C5 Trait", "C5_TR_002", "Oxygen and Aether"),
    ("c4+c5", "C4/C5 通用 Trait", "C45_COMMON_TR_001", "Smother"),
    ("c4+c5", "C4/C5 通用 Trait", "C45_COMMON_TR_002", "Amongst the Bleached Bones"),
)

TERRAIN_CARD_STEMS = (
    "abandoned-temple", "ambrosia-cloud", "ambrosia-elephant", "ambrosia-pool",
    "ambrosia-trail", "arcology", "argo-hull", "black-abyss", "black-glacier",
    "black-iceberg", "black-lake", "city", "cliff", "column", "cyclops-trap",
    "damaged-krypteia-outpost", "floating-rocks", "fortified-city",
    "giant-black-iceberg", "giant-shell", "graveyard-of-the-frail",
    "hyperborean-ruins", "inkblot", "irem-city", "irem-tower", "krypteia-outpost",
    "labyrinth", "lightwall", "maze-fissure", "maze-outcrop", "minos-manos-unit",
    "petrified-vent", "ruined-arcology", "ruined-city", "school-of-creatures",
    "spartan-river-works", "spot-of-nothingness", "staircase-entrance",
    "termophylaed-city", "time-frozen-city", "timefront", "trench",
    "trireme-graveyard", "windblighted-fleet", "wishstorm",
)

BGM_TRACKS = (
    ("LB_Bridge_Tholos_2", "航行 · 时间表推进 / 休整 · 过场"),
    ("LB_Argo_Rush_Theme", "航行 · 紧迫（追猎、计时）"),
    ("LB_Exploration_Step", "探索"),
    ("XX_LB_Expedition_Step_Ambience", "探索 · 氛围垫底"),
    ("XX_LB_Expedition_Step_Anchor", "探索 · 转场音"),
    ("LB_Excursion_Propylon", "考察 · 冒险出发"),
    ("LB_Grand_Agora", "冒险中枢 · 城邦"),
    ("LB_Primordial_Encounter_Theme", "遭遇 · 战斗"),
    ("LB_Armory", "战斗准备 · 军械库"),
    ("LB_Crafting_and_Training", "发展 · 打造与训练"),
    ("LB_Titan_Stoa", "泰坦柱廊"),
    ("LB_Old_Priest_Theme", "故事 · 主线剧情"),
    ("LB_Last_Academy_2", "回忆突破"),
    ("LB_Nymph_Addyton", "内蕴奥德赛"),
    ("LB_Dreams_of_Pharos", "法洛斯之梦"),
    ("LB_Foreboding_Theme", "灾祸"),
    ("LB_Forlorn_Naos", "低谷 · 失败剧情"),
    ("LB_Aftermath_2_nocrows", "战斗结算 · 特殊后果"),
    ("LB_Argonaut_Mausoleum", "阿尔戈英雄寝园 · 终局"),
)

NEW_SUMMON_CARD_FILES = (
    "246_Godform_Dionysus.jpg",
    "247_Godform_Aphrodite.jpg",
    "248_Godform_Helios_Apollonis_Exalted.jpg",
    "249_Nymph_Silica_Nymph.jpg",
    "250_Nymph_Midas_Nymph.jpg",
    "251_Nymph_Natron_Nymph.jpg",
    "255_Godform_Hera.jpg",
    "256_Godform_Poseidon_Exalted.jpg",
    "257_Godform_Zeus_Exalted.jpg",
    "258_Nymph_Ambrosia_Nymph.jpg",
    "259_Nymph_Aether_Nymph.jpg",
    "305_Godform_Hermes_Exalted.jpg",
)


CATALOG_B85 = (
    "ABzY8000000t)QCYm*yAzVP`~DtNIE#Eyo_dzD{3hQol*048kDFtZyc9CgX+)<G@xN@|Sf#EF2JF&J|nZU!4XFx+Rb&ENrJ1O6@>Ep_|V^A$Er>WiwfBxPm("
    "OR*cV5py_hNtLPm{Y#m@e^qAIf88_aZS@m*&yoMy``78L-I0TPj!@x?U+llu-iX#FFLKI$aZeHrqfT$_bbBZ_)QgxB^~tCmZ=RN2xzWx)h(dMju-Bjb@qhl;"
    "J?-?KBljfeo?qNEY!5rCx_geEI_^D)yz$%Twr{<({ljNo%iF#4{pjl7cP?MqxpdQe8voK)A5Ye!&7tg1OL<D3RYz__?e0uL+c$6T+`2O@r&P#2|NV>ogYqwP"
    "wv|Nvbmq|ML8Dhbn)zVb>ur=jxAWZ3qgVf2{M`Ch-11Q?i-t07CB5!eH|=k2%p5d&{x5gm`*Qr@$2+%v@_eMe+UV+?(HlSQy#MFj>zD6-e6d^@Zf$njYwN>S"
    "FKZ3gWouLRHdRUUO2n$f?OV6T*WXYjjxJpvef+0#iKMmOPE*-!wY#cpg{?KnE0|j(QAOT;|Mk(!ceZc6y8Yw3JD0BReDIU{-}VnLZQp#UTs&=UMBV(`Zf^BA"
    "dxQC3m8x=8S>wOHFuwTe&PP|(7gpcATpVj{b!9X-+v>}~a4<ozE~9jAsVoO@^Oe!n7jpog+_?MkxpI-bHIz|*kblRhwbAbOhS64kZh<`in%{i8d+pZU_r4q7"
    "xHNv}nris?+po&SidNc}(Z-;qn5L~b>d$YwP-Twazj62SKh>8UfBac7N`p<Aw4+W-J}tY$!R#6L;t%7i7xG`m?eAtj-|x4gH2>_DVl?|3`0<VL^IuMDo;{bR"
    "-!hNTderaD9x?v*?ZXy+{MpPw?d}<M_P2WJ*}*`)Fx#+myKmnZefsI>=kIs_b!q014fV6{4O+3P?y2E=zqhrvK3mu5(ubov&+mNo+|FNb%p4U*!(rk49-qHB"
    "e&^i^JW-~)fQ@Llt`Qo&{_6O{%lG{Ef8+=4buzzXS~v4cR_JK*qu%}Wpe6t7$M@AY+xhs_$q(u0om)RtcRT|*+}fP|3dMuG-G6;Q`uwHct3U7jbhUKK3^v<+"
    ")sTTq`f~R7w|AN#^%ZtMyfuFJrJc_&j;=jlIy&mEZFQo4YuMi^FxWd9tE0z%`)2p^zvSKC>$68IX#Msxs((tO!TfJNy8iR%Z`WrI>&WQoc6Y6nf7{sz?R<87"
    "^y9Omb1&U};bj$o0(V@dj=ht4ryKWrPnq}T<L|#2-@Gt-;e*}JpWl7<T%mKn_viz^KY8-Wqo*Ex<e?KMy~mCod)zyD>iCJ@-#0Daw6~vrFE4+)eBfTMuKM#q"
    "JC*%OClqxHJ?8YQeemP%`_FmzKDhTmPkqok+8y3kSs<R2(^LPMl-S?sZJzB!g-+wO&$e$qJGy*peDllkw=a&)eVhL-&tLTJJ*5gho*(3$Iy|zv8q&)8YVewT"
    "=fQfRgBV@EIQr=?`F}58$^UWrig)j?)Q6|vJO6NXkyH&GL)lH$7+2BBpZ`Fe@6(RmyZ6}M2fZhzAFM8rscv{6RdCwfbZao|&vr07?_Sz{>9g%ypKsrM-@Es*"
    "$>+Rdd!MT=j<+_WeiV1){-7Ce4b=&jb!N-m{ouy#2j7jZy}A3vv);W=Ob_smXE{;tf&BxjD-hEkU2E8Dol(78R}KolqlspWFaCAs+~=bozuEcY4=P~!=e=Ri"
    "dvfpd)ddHwGwW((&cAaf>ZYv?Dfb4wfsAG$|MceF_nseJzP^3))$zZ+AKy^GZ{B@Q0e?~*KZ)O?>Ui(5{P@YACuOAnAQ~8Gyn9dlZzsH?2Oqod{~aTb#lZ8x"
    "^o2rirjH`nd=$C+)^m5?{JG{RGCgSFDAMi@4(u=*%o|AVyfAw8wkmMvr>{m||5PetUAC1Fsna<xB-_d(H)lk-{MGn_Pj_yAK7R3z>WOO%D$|C{9aIMDCp(O^"
    "QAM2*qwjC*{`_+x4x}6fQjEd#-`_p={pgdg?q2-XCR->R-+Z>v??q`#rB^Bd{pe}gk?F#O;qE^#Z{NJ7RC(vhr+M1&{WX1LN!HsP^=s?ypBICz?!uH|+E(@3"
    "8-4w{K7gEAkA|wFQ{OQgwqm)idg+DP!ub3f+qeI*d+YD&$FTGEdn!p#-%}q%)OR}*J=4njxlJ|dsGfbWFj?5W{88TBsT1#7MVgSP5xKS2Q{tUGwJ<vvzx!9!"
    "+vL5#CpYwwL;afep{XoxJwI(0W(McK+x_{xYVEvVmKrM()i!m8=jq1UlAPe{Pe<oI9iM-F=lLuDe?qV%A(-h8Xt_V2h5kTA{O)_Nk3RnJ?%Q{EFMKn)^tG9F"
    "YKM76^L$tlkljHp4ad4!yW1X0@8N#$j2h`5Q$<aU@;?0sKlw#Qo#Et{KO4?Vud844)b38I_q`M9{rmJ^chqmIzDON2*#F_o2Km<e%EL#0`}^pV_f-h;1atC>"
    "QKGzm*#G_Pdjs!@>5=zU{M^;=JBvD<SrmVMZS=`I>Ll2`@v(A@y${@{|EA^twH0;R!?Ufdr%u8`8KZOm7=Qh@@t^*>{o}jdy$|hu&{H4uj#iY#R8MoZr}~De"
    "44ui(PnA@!DX_C=&F**ScE7tY`t*&RTc71W>+|n<_dYN=aL<Cyc)iSfVDG^D^dEdQH7#{QwiDS(w)%rY|GRzj#k()OvU}~^=r4cC`^U@I709Vvothr<;N+0|"
    "DjZRLag{3#67@@LMSCsDwmO~GMz2>m(cZZ}zI;CK+iriP{xLlP9^5<9i}srGD|Mvzm^$)4i=Sa`;`t}N<I_*xXV6{bBDY-X3Z2uOzR5c|{gC(2v<EvpdN{G&"
    "-qs-J)6K6#4JN44=xm|qy7}z(%@?+BewDk`Czll=Wx1#Jj`JR$95(^=Z|b=F?D`y)TueUfJuv&>`<8b_UWF-Yo>;WRX^OCW?Zw?|H*$?K>5fXr6uY8Heldv7"
    "s*G@9*R$D{iJT%nv)=0z;(hl|UyRN_pPz<r-`M`?O_dZ)K0M+2<mAH@eNigaD5-v`>SrulX?w8V>-Gv4)2=?JY-Q)w7nKG6uODCDzWGZ2=bN96&VAwC`)~Qd"
    "-UE|^y?@&~xS~gzB+6acI@{Z7rM<#ww*Avz$1kdr<CVM5zL;N-ymf0YJMK#F_q{Fe-+Eou-3=?cs=UxO6>3FYc|)(DG@pFF{lkmXf*ziJ#CuqMq@t6`-AJAK"
    "(~AO0ub|)RTaEv8IZxrwzp#D#Z`-%O&-1hC=O;hu2i4~*x}-@zp>VIa+Ji}gIoscT^z7~*^Oo-3x|ZADPuEn6slMqW4|%_O^r4fFc*jn9Pd;??*A@NIdeq4}"
    "?Wg55TbP_MrPJ&6=ku#SuUy#uNOee8yn7!}N3<q~<eljB9Q*%Z?{jal`zaisUp>k5r)koy&cLWs5TJjZ8{htNbn{PlpHn}GlhaRoy=jVla`NewcQ^M=`<wi;"
    "|MB1dad_uNomGRj8dxShPV3QLqPY0K#J@yH6?)I!eVN1CE=Tg4Ge@G1lD?LDPj=N8kJ{P`t#-@z^LsSO*<|u9CO2$0dg<1*b369H6YB55R=lQKu$jN|=o60|"
    "J$>q-#~yn8_(|`6@8~i0emB~X`|o-C?;Snn9rLDzcegfT*)Jb``slIK$4*Z_G3fP&r+Z4c)Thud?#ZGgzl-!=_hkLNLpU<I)pY;n;Qm4Z_g5G9%m3V5Q$<cv"
    "g?dMxe&FbXzn&ca-#Pfr{DeH+SJu<+D{VNUepPbjqH`U@xJkr#DPmkgjNK4pYs9!Y#H2~YWGP}&LQLEc6KlkzImEO{#B?cQT0%_S5L0W!v^m7ANyKa^Vpc-T"
    "+z>Ns#H=~Qyh+4-DPmqi%-s-kYs9=E#LX&&fm2jTg>azkU=>YjMYCREAQn|-5jb+j_MCBpoJpgc$#TwRy$BsS6MN32LC&;M&U88FvST3M5j3?2O&bKw8U@Xk"
    "gD#r}LXM!BJ!sY-Xx=Djz8rMfHxPCN&Fw)qrW_4BhlzAlUdnLE0-e00QSoTlJWSN1$~_QurHvhE<0fg7W@!@x+GPVl%#}8ApiP>jO`D}n4QOi~!d+=o2imkr"
    "+N@dH%z(BgBf^z7bD+(dq|KY9%?)U4MiRKv<_@$0oTTCf=Nl`N_bXXH@WiqkD-S$TePhKoY1}WbKIQ!*n`4ZdWQ><G*6ytMZj7-tW855L(j;TDlyTWSFmhu|"
    "tQnK$7}F*h)1{2dzJakDV`|NqHpiGX$(Su=T(%5M+!!-!#;iHUyh+A<DdVzRVCu%0TQhFTE1DGx1GA`73(OoaJGe!Ya?z|^80bZ%UvNjz*d8=)5Hx8NG+7Q>"
    "lMLYqn%ILT4T7ePf~LzsYo-x6f~NMMX@j6yqoCPx(3)<9j-Z)6Xx1QT-Y96k9CX<^i0=rR+k<Y*IvUmv6Yr=J58{#wI+;hK>d~-!n8-(!eGu$Q8#~a(P0}XK"
    "(k2G9wJD^;l{RspO`4=lo25++XqP>NP*>X2fi`WDHfxqPGoW3T5yD()GY8tNN!q+w+T4J)W+dE|Hg}*6;3Nvyu-%o_ueP3XbdwX)a^|5war`%@jy?X6_q)Z8"
    "viGsmzpK&|+ibE>X#E%z4tEd3puN_O^26r6?i`Af`z6f_#>rz3KYsMoZ%!-?$H51y17e$XmWr((l2QTgK^gX=_E3AR)pLx*sl3>EQ8;zNJH8nIsS~G<S8=yZ"
    "LifvS0@c&)hFSgg*iu-(t;%kwZ%^yD$1HHI%cr7Yuba;wIQ(brd)bdX^y{Oijz3<SF|hw?)xyBN_vS4L#B@>Ov3KzO<wB}|oAW+x^Fy4E3q#|=3vg){i7Ba%"
    "3)jMhVQ~>?Tx0<*?NTqL^>L9}xCksR3XO{{z@=TVrK~<KS_>D2#l@g;u?4ua%dV8y$Hi*lVz9V4G%mgXmwv-m)W^kZ;o^X};D^SAV`KH;7}O+Ib996r9^uEw"
    "g#%>u2pL*1!}XY9U}glI8Ck?k8zz}=!Hm>nMu3@7aAtH7Gi|J7$buQI$BY6qW8lo#B4*lv$*=`8R*xA2X2!vp@kPwEQIio1X1pFV&~dYYfphW5Sv_s3uKCv<"
    "JHZFf21d`t!)N9A$(Ri|ToW9I21nq*k%i#&L6qBoBQ?PhXmAuB99;-bA4!D`I9d}Ng$Bpq!Lfzl^x-tH0mo{BW6<C@JUG4(oIa+8HsE+oa89FY;hzrIX=m>{"
    "?!Q{K&S?MJ&skxFd7Ttt@v@?MpN7SSp>g2_xb(@qs6H-S3m1mPMWAt!1-P`aljHihNG)6h78ixaMHk@GModoX<D#{2QCM6I8W&rDOB*LSt&fY<!o^^5acEq8"
    "0WNKH<g7j}UJDoG$Ou0)E*u-H2S;9$Sk2K9dU%8%9~Tag)gz>^V20~4!@$f4I5V<{nLbPg7R*RJW(1fS1!qPVG1JG&(1IDQ$BY6qW8lo#B4*lvDSQiNtR6E4"
    "%#4FG<BOPSqozO>%y>O!pyOr(1LxwAvvTMZb<Mx_*a<#(HZXcF9zH9_PeE+J;hNwuG&lkejw}SHFaM-A;7Cny1R5NL2S*oz(?(LkY{1c);3zaW1`m!c1g8(D"
    "+y)%0364R7<M814LU8(+Dr~^<n&6y9)&2DgrN3)Wmp=rkty$QAYwl`={T3}+r+`JB+`(XR!oovbh#oFQ&|Yz%TCx0K|IGyp5B3|kc*y}4b#e@&bp}fga^X9j"
    "Du4J_?ezqQP)oDp_ur^mL$KeFIjaY7P$%WETr!Y9b6F1BQ8$17@nB2#r?;o{7cK6$oOtY^lgExee)@^uoH+TLhfZiWtoGjb_TR6bD_<&Q?yUJ>u{D>9xqp7a"
    "^Ugl=66{XJI)T8e2n03?gl6FZfe8e54g_vK5M&jBAVz`EtUjPHfgsL-Ak7DYt|AcBC=mLlFAOFS)Hx8e`9QE$1cDg_Ld!Y=4igCG90=BYAowZ*!Hoi;Wif$("
    "2?Tcz1aCMHtI;MyZ>koj03a3s=ClfRT8%py%2TyHg+S53?$N+2hz40nG>BO=G=&O%plA^HXpj{|gRUeR)GQjBM}-I|8q_@+bOq61D~Sd(i-x|#9tMgAbB_jF"
    "K{WVEqQT9gp&3<3fTF?OqtUoitw^d&t*TP1LWt}e#H&^!Rx2_qQ?;setB^s31OtQwuOcL5H6bB}A<+ekLxqF@goLajBy=?)p@t#RElWU!gaU+wt|BCCH6dY!"
    "A<<PUfC>o%2nkz7Ncd_(!VN>B`&I}Q5)Kd&Amf_zBFMeJ;v|T2K&sbYmD@XKB^L2r)AVJlv&>6qJ`i{nfxt$A(6&tW5lkSkb0Bc@fgr001ThMPwwtn#VFE#%"
    "13{V(1YJcSs8Jxajh1}^6A0=Y2-<ug*eU|Si~^zU!R%9*KrrV(u;v57R}lzq6bSu+5ey~}+&K_UThnT^$<Ujs#fbyN0>GSBp-!uDCqsFvwkH7;4eTBbyn<+u"
    "l|+M>MMGDp04N&7JsM;M(V#1d1~rR@?olC7G^l$t=nA62RuT<n77b0NkPj3M<{k~Uf@tuSM1z|}Lo+IbfTF?OqtUoitw^d&t*ZJtT@cwfh*zydtX5=JrfOB`"
    "R)|1_1OtQwuOcL5H6bB}A<+a2QK*m*fRK<?goLgpB-Ah@nq?sd6%q;%61s|zu+@Zw8HPkxEe;hD1`raqijeTtgoGQ0ME5NL6%q~*5+LI`T(vvr9gCHwdT1(E"
    "@|NSXU`=nC!NRAIVOI$=TJc-67?@bit_Pm`9!R_@*9ey*ws5s@8OM@Gm0?#;Gh9ntyC9&*ZOWt_bt>M;Ixqp7R<I~szk1XpPQQAzIzY(vve<sX&9lTSV~LGe"
    ">Pblm!xA^olB|p+F=DA@6WE7gNt$O#SH_YWvDDH4j9^$&XO{arGw82d?9rf;)OKqqbFALCq1@bg&ws?O8Ls874xK1I+i!P=>(N%fH^^t&X|L3t)Ai`l2Y!Fz"
    "*yE=jIr^IuljlIr&af-JS+$cx@gwuLai9w`&|(?)&ndEc$TvIIW|TLjjhm&7m(#`?ZSG1NJJ7~W(k9K)Cd+9Pjka*5O&n;GCTY`VY18GjsYW|+rA-}Z(<W)N"
    "W@)qKw3$XbbfwK4XtO41^JZ!D<+RIJpy)!`H6q3xX!FKsH!US5R#K@Y3ypX=G$$`<R!o{U6B9M5bd!bG@64!S7v#86<fLKb!~nS_C<`yXnNcGy$VsEfX~W2="
    "0dmb!7N&@1)Tj$`+9-0?Fmh&qTvHXyoRKpZ<g8KTykX?r0J-if+!;A{LEfOTG_EX0&QdKcZuzF8wKS|PjeCocxKx`<;LaU8amUSaCrxuFCfs#>3EjC9C+?(K"
    "?zCy{)P%d{FvNG~PMx^ZX1TMbxib^)n#d63&Yd}NXU%fwO>^fa+%=ma*qu9f;tt_6Rj;_;6`GxUReG~(jen_ua~AkhVxO2UUfOSVY?HKcv$XMY+M2%*>Pj0s"
    "(8f*DCe6|&%V}%YLYOOU;y{};Nt-rHn=YrVy9#%uO&w^{CTX)~X|v_Dbwd%Zw3!2K)+BA-EN#A=w(cc?D{byTyE!LmT1rf;q*_ZtC*V$A(yW*?Z6+paQt2kt"
    "cSep~kmE*?lZKHK1LT^ZP~?o9xF9EuBBu=_rv}J1OQF~qIdwr!8%53<M$Qb7YpOztGjisFoHdG^H;kMcAlH0_QfK7c1$l$U(zvo1IZLIqP`7;3(OMeTmd3rs"
    "NL;GTg}ZadPTX;`+)2~ii3xXIUxYh%;>4Xa%bhmOotkjh9VT$+PMx^ZX1TMbxib^)y2ym?+?f-1)+~44G<R;oU9%bHyL0DG+#!5se;Ii7%e9xNYW%eY;H6K@"
    "UHx5Z^rEHTl-Xyj28+IH6aWyA!?oV?-f#~}#VYU8XBI5+F13I0`fkeXGh3sT-L;B<2+!VP&(h1oO@OGBmwA>xaq5Ys!8rBAoG92QyZc4LVB6?}5_;^!ER4xt"
    "#dg=oeI7gU%gwGs6Q@g8wHIrzTh&@!TC`d|D=Jp3mP1&*T$M8We7ycb)s1NL$gtg!gCmP@j4odvUHW<a!JW|u?-sF?-r0jO{kz<Ly{%PawfaW)w>P3SIk-PT"
    "t^B*?k!nreE_OC^KAFF32LQtZz(oM%bQGBaz{UWu0{{XKfD{2}j~+4wK#Tzp2LKcv04)O0R{5I(pvC~G0{{jOfE58~nUX00W(<Hi0O0Tdco9H3WnrcOxG@0k"
    "06@S45Jdo@1b~|Y5XJz61AqV?Ku`n_lmG}*0D&=pzyUzmiaJAh2>Zp(fY^U&7DiwSV{))Dkm;u#pfmua1fv8ZGzVc0!5RSa!2wK)JOnWLvmi&NdWd{e0_v0Y"
    "1mOJ`75x~M{TP}0Au<+Z<RHihUXW2ykdY?Hrh<r!4H-EYG9r!ijR(cfkRTO(BQmwc>CwhSh+F4~NCQMlG|D8XISF$L_5^4%=LOZz3tDwvm^$S2Xk#MO@w}i7"
    "5Gm0pli=ng%qiFtfX}B;F`q)^d<vP`Br;B@kV8U+;1eoTOsG&fp+cq#iHtKU<d9Jz_>2k_Gb&WhsF0~UBIA?_Iiyr5Xr^}z^xiS3=pC`KM+UWe$H1|73>qL("
    "qERM+%t@G2uqObYRH0&0g~~}4Hug#5tO_|~RTw_2!o{o#m$NEt>X6tttHKUh6^75Ma51aG<*W*ux+6Bus<1;=g>fUj<3X`AByd&lXzGsBqm7ARx84!s28fhs"
    "lu2-N66O@_2{e;yVm;TyRk<cM^+;SR*TjywCMFFKDbXmC2+T>CQ?MrhpH<;vR)x!16*l!rY@AhLhpY<2XH~eERbl<X#ij&|vnuS6Rblw73Kz2~tUqtXlz?$o"
    "g&ndg44+luVpfHPwvo6g0pqL+J7iTDK7YW)`~jEq2V(4w#`yzw$R99#{(y`511{$e#Mm8;^9SsZKM?r*ffVxxQqCWUsV@@a{DC;+4+K7cAjSNFXb%)H^+aNv"
    "KM;rffxw$GDVj3T9+_h5hQ!#EiGwK<cqb%9CnVZ~PE4JU7&{?xa6$s_grw+%M4Px|>V(AD35kOf64pqzbWrRJ309FUQByyh9&Jp7xn)a)H9(|9L)(MioP;?A"
    "djjyLOp2yV^nF%M2^gC)aWG{9Z_1=-%0y^ea+ne@Hf7>q$^_n&Nzs%^psoKhC17mI#KDvayeX5SDU(o}$8Ji%*p!KbDN}e;rbSbxWmBf6o=A;NnL3y<g*Rnd"
    "G-ax-Wia(bYHZ5X!IUYyDbu1UQ*FJusV7onQ>G54OyNzL7EPIIE5A)Wks6yabueWLZ_2c2%Cv0C%+w93u_;prQ>O4vNQ+KL%TCBlosb$kA$4#<3h#up=!8_8"
    "<ZtSP)Yu8BgA-DCC!|Fuq-7^$rcOwWosc>>A%%BBT698Mc0y+Agw)sxse=<zcqgPqC!}R3WTs9?jh&D>I3a^~LRNG_R(3*W>V(YL37LZvGI%FsMJHrsCuF8h"
    "$c&wkIXEGMcS2TlLRNM{X6l5@*a?|~6Eb)wWJM=rWhZ2&PRNX%kU2OZgLgt!bV62kLT>7W%-9K;gA+1%CuBt@WMwDhrcTI=osc;=A%k~9R&+vEc0z9Igv{6p"
    "nS&EDcqe2<CuG{nPg5sk#!ko_oRGmgAuBo|D?1@KbwXzBgv`MS8N3s+q7$;R6LM20WX4X&9GsBDJ0UMRAul^2H+4d8?1bFG2|2tI@}d*+vJ-MsC*;OX$Q_)J"
    "!#g1_Iw3DRAvbkGZtR5I!3jCM6Y`=H^0E_hQzzucPRJdcki$D6FFGMFJE1UjLT>DY+`$Psyc6=G6Y{bX3R5TK#!ko`oRGsiAul>1FFT<ybwY0JgxtXiIlL3{"
    "q7(A66ADu&<i<|O9h{KEJ0UMRA=kD8F?B+2?1bFG2|2tI@}d*+vJ(nZC*;OX$Q_(ez&oKRI-w{#p)hqqVeEv$!3hPt6N;h}in0?5QzsP0PAD9lP{2E(C_14i"
    "JE1UjLSgKL!odjzyc3F|6N<7E3R5Q(#!e_4oKV0!p(r|`C_7<b>V(4B35A0b3V0_JMJE(xCk#xTP#8O*aBxBa?}Vc0gre+(fvFP;V<!|2PAK4=P!yd|l$|gz"
    "bwXk6gu=lI1-uiAq7#a;69%SED2$y@I5?qzcS2EgLQ!_Yz|;wau@edhCk)`7Feo}<P<Fz=)CmJ)Ck*VJaOi^*IOP`zO#dtpFmyt7q#=R)llBA<JONZBP`2VA"
    "FeQMD2_Odo7@hzw5-3}75SkLe#sshf0Rm5e6bY2AIP^^k5Mu(wfdGXkK#K&*RvaQz0@RoQbs)gt39ur8vK5EelmIg(z#Is0cmljgplrn<F(tr_3DmV>`OIdg"
    "*N=wnUiU~6_0z!-P8SS|<5xf4x$*Jnm5+)XW?$Zeuvg4M^Y{K<ws(Fs7|7w^{+X}UntUzQ#QXCi%pavt*)jyvGE{0AGT0P<Nz0I9%P>sKaH(b3V7L1vEyIp2"
    "BQPx^rIrzcZS0q{j5xN8!nBN*T1E}_r(e=C>ew;{(=t|S88g^;eo4!iW6L;9%Xq0}++aufB`xEQEfX*;6Q!03gRSD1v`jd*EP!cQP-<CVu<!elmIaP23t?Io"
    "mRe@Ak^7RCg>EfFFb;xB4q~=L`{Je{M+reN5`sz+Vz%}AlBPLY2!gQ?RI(7WJ=K>q%~3-TjE10+hUnXZ*Y^<Q=phKkLr}>>^qsBiiwJTQ5d<S5s3ao#meuu5"
    "1UZ@rf-w<PG7)_*>iQ~z990Cts0b>lh`z~meHTHFE`nfO1eIJw+b0>-ml5PBBM3%DP)SC#4UkcN8$pgXf?;d~muy7e*|@%qU`HFlFgAiqHllA?T;E2pqm5t~"
    "8^I+T(RbagZzI^zMlg(x;F68#8^_kS5$tFq7{*3$$wu@YVe8uncC--;V<Wg^BidH4xW0{GM;pN~HiAnwqV3^|>)Qx+v=IzrBe-NE+UBgdzKvi<8^JI(f=f1{"
    "?YfHV+X!~F5e#D^xMU;RcB;6(jbKL`Auu*VN;abJlUm<Kh@*`V7#kra8__pFt#2d5(MAZ&kWETMw!W`teH$T;LpFgKvPo&k);H{|ZzIHU$R;pDHYp9++Mbi7"
    "zKsyaA)CMq*`zdNYnw@u`Zhuwhin2fWRud6t?d#?>e~o$9I^?_kWETMwzmBvsc$31amXexLpCW5+1kF2q`r+1$03`-4B50aWNRBXlKM76orY{gV5W=gmvhj#"
    "{TG&QQM{;ilS0g!HyHN%XIp8nw{b-J0ghP4a4hK&g#1N~eEZz?t(WfKdG6=YtAEzpI(fIy)}!7N>rr>u+we}U_hpn8n!Q(*;mm}?Z+y_`*7UVWL9M8@IjyQS"
    "oK#gckI1&DdJ~Q2vqg|>PpwPuXgrYJp?4xLqJS3ZXOtaURgj_}ThXMZR$tX*Nw%saD6kmzr2SPil-X9tI}vqL`G==_TZ1B9tkGq5bn)bD%cj+}`UllnBA#0u"
    "6lVg-`8VBYb5lm0DDFt_p|!polrR$wGq=O63Tkc5)Yg)d+AJy0D-8-Vg@k;pdq#bK?|6DvHSBDWuRiPuJHD!*R(n!Wt2eF45^Y66)>K2Rh$51*B#Mq8UszL}"
    "eR+@S$@OScddD+0thKvq1MgJNd$6}r?1T4eG@J%nMP>5Wq@30uudvn2R1cb0*c$d)iK?(BW`hEua0igMk9D7J588P*@uY08tq+U+#9m#7vr-pu2_|RXURA9#"
    ")2i$cR~H2ZH-v=yc+Yz>I_n+Z8WyRB8dYpXRh84~_F8A6v#s9N&<<y*jCvf0GFk8TI=!{CN8)HW>`3(q^+|QINBxane=f<L&)*ndcveF=E#r{i?)e|aAG|)k"
    "@X6@h_p=1|D)II!S=JF8e$D;4?t{%vdw6=v0?~-dOiC7ELQ|HV&X1q?{sG3t1&}n3Wk^CHWr9$ao}NH7P8f8E1NFf!48qYzACCU^4;|s8ib{Z}Hb4=D3<;X1"
    "QA)EglC=TGOo)ggjw4BZ8Zvi)8?rN$X=_bJ&IEU!f9vj>H+TPbZuH3u1%lH$yuCV>{hAjO;6h|5!*LvhocXb+jZk%ABw#p=X_y8gj-3(4(V(5Q23wn(s$s4C"
    "z|9SnTsWVPS8nZm^z8VpYvb2$=u9V-dV7_6vz0DOWtW^_8O7=>jZ=|g%>1-AUgifPzzGSGAPrF*IOC1dr=xD7PEl~ecmIBI=ho+=3tyIg@%uF{#Y^jV09ihW"
    "CPKsnGa>!jczGO0BvNJgenb$H&Up8Sp))et>~#k~1JT!?jo$mBY9KnSW?AOC1SFCSB{)j5NaBp}+8{-Qd7QD7rV*Aj#c<~-FwyB*I*;qYxw;rIuMIduGNwLG"
    ")yd`up=7lIOX(9ylNd1^DsL3-L)E5C+EJ(d2YANYH{Tpx{cZu~nYx#d7PUzyEFf6r^MSx9P-;-WPoO@^RL2q!q5hAhV0}VA>aHo+pk2f6oy$94yfnXqnASN5"
    "ZcrO;#JC835mG_a$Rv~c#)Tpk8<8NPw1EVGaAlON!?GRS{%-rnn+w?HRn9>h)<!F(%Hd-cDXB+E9Mv~5nTS9NL9;kzlw;o+?Yev_8uq%aL7wThCtt)(Xy5yJ"
    "_k}->zW-wT)~(&o|2Y2FOS4q>YV&4lTe{R`Nq&{GSS8nCNK{7<Gg6;u$gxau76p<ix5Z#Yqpe|Yb8r?G=-);!zEcJCu(GA=YZl|6nUVw<rZ^xx3c~ufg`-T3"
    "VWCe@B2p?sFrJ<E)3P-fZl$0|ciy@(e)hSYzrMBe<#$zJ^IE<AT9+>HS(+$t7A2wJ2}_bRsLeKvStvplFkfUbirv|EqWEmT-5st+Tm9YutP|M1^Zn@R-^Z74"
    "?YwwN?*xjK&g~28Ct@;?IKn~9kx!^n{n~sZl_jJB6WkB8koy#xFHo0I#9QtXN_gk=4Af%miX#?=LipT|v!woo7|v0oPFyBwM1wfWpy|SO5VL^ibr2=Y^ZN;A"
    "kw=hFFhS!aCCU@(+igT6EM$g)B;a9~xaSc=r9xf64r28BhodW3M(2LgdxyQM=5`D9(=v%-8KX1}BNT<|#Ix{Of+rWhvMft{$(?a#y?&ncKGj!4%wS@*`J@nM"
    "s6XBso&PTX<b_M4KmKF%+8eW6r*(SMI=z`Xm#)cLGA2<T5{fgQMS(yTbfY+-F_W<jV?PTi0ytSavM&c)gQPu-Aiz%ZuhH|bj9$Msx=>6LD(YIg5^Tu@e-ZFV"
    ";#4U@%o(bGnI=uLJZ;Nj5@0{!?w1qui3#eb-+jvY41MFL-8-+3|M}whpPv=ZO;v%nSHaT7W=npnlBUELGNw2|F|VHw&=9HAmt+WK1SiZr!;1R--kDac{-3JL"
    "SzWJwefQEA<5#~NU-+bOO)Ia&JFH~sy0&F$CQ9QpmRzDRiv9XoK#(vZGCvCv8e}Xc&J>e=d(a-VHv7F{FX?rh&%{^089)2!=#|%YuU?(yIIYH;sb=Xix@GrX"
    "d>N?Ik;#Y<g|q(6fiw<SNJ5(O7zNBdKi%Bw54L0<4CU^fpLTD4wfpQjo#tLub8*&Jd>Rw(%TUn7$0GDCF0oRPqCg@X$N;OZ)*k0Ty_e)4KcXy9b~^1f*-d0?"
    "EgG&%C5CIQ2~|`V??JIMyS4r4-1x$$<F~%Md+GUEytDOs2lf8X|9MdH(#3>JuB~7i;*_T(3YCjmc&LwA%48aG8VVBg7y|ZSJ?eCNX9lfq^mKd8YJ9Ik{I7H4"
    ">o<1Kf3^G3%Y}>Bd$oCm+Lo?lT!tk{!$779%Vff^MJ6SD9E7n{P8+6_aR{#cbvf+y+X(>7?K@X@fBtavbzzL3DSzo|$t8ls!k8wiBVd8dWE9q)Qo&IcaYj<?"
    "^N33cfiG=uc6uA?1WA<7cP1yw008CalXtdneKI=t?asHiXK5Z*=gn5Pbg|}=6EkIzuS`DXeuUGY{;)4el;IR}CIgzr0z;6U8L#4w+yH=jIAUG<Vdv|2=8RZ-"
    "l`UN)x+IrRxym_-I?;qgk*I$&MNmJ?l#&KiM7~OuK#;2JPePoXe|dTI!?y)~dnGSjf4aotNsu7v`(fbI)DP?DKq~F=Nfd-BmT{Kx41!wJ9kyHTZrV$RYMh;}"
    "<JeqpcY1@~=K5I(oUgqye*3-A%kPZd{Aa26tf<>7)V*|7?6PTUL59*ONmHH)pVz-M?Z=^#Dj@<w7^2dL0KVSalr8ld$e=X3`SSSkrR^VH+Wq`*g$w<v5^ukf"
    "r3-ME{Md=aJobYqN@>h-ePI$fiZJ0Mqgl+;n1P(O{k2}J*NuCs28&B~RVdGYuzT(KyBF__&z~Q?R-6Z<D)S1JEnWD#<it!;P6XvyMr9a8_46mJ`hf(ilNuxJ"
    "Cw>Sr*h{(DIopyOxq{`>tTx*cVzeK>{qpGbS4Y>LAHVu>VYHvr=k3?$?bo+-<?*ty2{RmJA*L}UVPKJ)h7qEX>ZUm+F~uOgtb8U>WALPJ?e{j%cGN#G#5w!I"
    "t<ej&N8fyN_uaw;yo2hz{pvhyvhaD?@Po4`R^ty#m^$+;CauPCkjNxXvP>{eQwXvf?QSpX=F{8dV7QmeK%BKZ-+a4!?bi66YrEI~G`{lbEZu39o>t}3#n($T"
    "lgA07zT|$0@~fovuQ^K;3xYzPMFGJa#8Zdup`yFK)g8k0vg2>Bk3RTp{L0(AuNLR0=k<7p^(<ZOy(Af;0nd0EiP(=R<@HZh65&WjOyY!QX_#?1mVFuZAz9x2"
    "^q;$b{HM<Hu%4yM%a{CWQzU|vWynvYqELT&Pmo5DIw=_qsSqL)AmjhxB+DotlUsvcXAA1Lzc<tJ#?A4?H^=Y%F#hQLoSBxBs=e8&m#%kTGWJ9v3Wyre2@NA*"
    "aV0QJ0^j$O7$=eRRh9t3I_b+ZE&0r5)E&TFm)br5!|08R;}^dizjUd1om!spW-D5{#D0k-ajLphb?ydXgi%22_ozvN)Og1Q&(h2%81&2q$9gb9xDxKcX}gdz"
    "t)FFuB8sR;St=wA1B)z+GA2pHk<4%J#RBA<9c*pNe!JIiq<`4`?%aa@VZZ97{R6F^i>c8_C8JTA(Im_wWWhQ~S)57~F`p5NA_&%<XfSLIrz=jK$F$4Os$^m3"
    "{XdV+eX;$+XT`ZGgQ2%qO#x&593fHTx)hQGIAp|+>tmDw;ju{KKt?>yVvvii8{J$d2l=)HgEq)%diDC~&hxuhZ{7X)V!>ah6?q306=+(lWnsRLQ-mXRa%GBa"
    "{VV@ThQrYJ1qx%8(1HlUX1~3mn$(Uutu#6V(Y=m7e`)mdU+&(1b$s#F!qvfpn!LT53Op_Dq@)1}vxHKVq=<+0<u#!)MF9%^APQ6J`%u>j_onu!obo?qGKBcG"
    "UwAj4)^q;5(a#^<{pg3COIOR62lr<799CIi%WZO4fpNf)a#EJ~^?&(XMJK^=Leh{+3M8}rWL@?;YOL65t6ydU^5cK@Povj9*}eAl?ibINFS}M$SHLPPrdH(l"
    "?oi+}mEQB9{%XN6B)&u`p^5LKG$dfx2+#ETPl4nF7w?R&zm;Db{QlF?2N$%<gZuRqKw3;Zi{q4}BxXSxFwCgMofQ<3NJvHy;;KIek*Uq7|I~DQ2H8sUJ&4wN"
    "DafV4uWyfDy}k44hpJ0eWB$%_f8V|EO>w!Es@dyh`B>%UHG6wC7cke)3^>Ca`LSd)kRk}{-);2~<07Rgqew6$K`v#ff8}eQT2ZId&Q%>^%=+|&@v~nkw7bu}"
    "wR7o80qwLlZ>F}wO3eC+KqdtZGxhsTgutpFsNV_rlqW)BKevI*hr58)Ta#TNshVDN+5Ok|<6Ez57hPuRDX^?B`YFqp8mmGcsZ5>+^~Wh9W1>#-gmGW}BLF!;"
    "8_A{SWKqkKCszNiOCWgc^GGI2+CxMwCIaA0hB2dI%JW@7>Q1xDw>{X~zAyUEyaSnwZ@SE1!#Df#9=>0x5xlSg&C!3~E4ls-ANlv&zwj~ne&)NHl$yqUfTo>{"
    "+8yuYW>4jP<py%!Y6p%|1G#VCKmyUg_4ekOzD%ByeNX*cc2cdK#A=(2ayyBAI~hbfCmW|cp}NQXe&5l(4OEH^WmX$jlpD(I8!EsWIwzFEYR`yr3x$0PL#P%G"
    "r5vtn?F+58awxYiv~Hh30PTCA7Y#S2lYI)U6Ub^Gg;MJTvTq%MieB7_QoVh|YWIS2`|LX!0nyR?dU~<o*S*cQHe?89wS_>rh4wv+faqbKT#q`^`*pYdwA5QD"
    "tXA@uTWH_I2#6l$;l7N9-l@Kn-h-X3SZicxx4OREO8b5$faqsV<z1-v>wKElK<i2aWVhnI)W*QRw+SG6o5!Q4qkPxe4Xu5|Zq<3YefGUg0MXk#BBQ6zR(Cc5"
    "vs?FFZlQf|6F~Gf{~n!*dtK=reMTEF0%5oIy4*th-X?(PZ63(4ehh|@_wZI%Yhq}(=(*fP`>rO0=xUyj!+tw!%hdb#=xNz$YwZk?-D>1gJ45^KCWPp29&M{H"
    "nx~9Us<cXLBQbdd<?=S#cR3-08vZ9g$p_l$bQ`*2Gnw7e=W;Xc`<)P?-+8pxUE9d-_MY6F?i5*Uq_A6#TyCU&*Aqf?J;$O=Iouj}kG3<pwx!C}+8Np{94@!h"
    "y8ppG259Hez8rW*w>rJ@C^;?OVoh(cfvOn$22y|qJ{CQtBu-iDy4FByx74=WKx*GWh--`|H}i>v-Xl@JTiO+W(nxN%0JhvnZr@0dD;s-z(>|c`kHK)W6Ah)-"
    "($H@8X}P8LKS+cCTY7Y$n=96yW{+*8M-^k=MgrKz-?cZ_^^Qk-_&erSjU@Jsgs_2Q8`BXaKV_eieZ85?Zt-NfnasYK5H@hM8+FbO+evTWJvKeM+)iP)qOsgg"
    "Vc$-O9_Wd~c|?!y-6AWrGPGNPSZ<|#?}L4ita-Wx-J;t882fgM|4MDezI|IE)aTdTt>meWtiB_FwdYwAEB(Rt`hy|#=ZSWw6ZI=Dnq%$J&%{c9u)Y3Z4tB<F"
    "#9H&X-D0(J^X$cE!DEEYn|DGblv~|Y>D|VL)PISA-MX=IBLnM35{O>s;r3cozVLzd2k%<B4zcfL2!gs#{$RAx)7ppZ7E+blXYX<Z!sSjyd!1-iilsk>*UE8-"
    "y~+^?l{=cx$J}h^j~?r;wYyqZsz0~ZN^yw2$`Ozo<ijX#=bNYNvZ_Dh)k<%Oy~Gii+gH)%W@nNv_j*rhjSTIU+mst=?{E~R$I0aItaqZfshy}4*)4J@wUFBP"
    "ITWJLIo2Hv+uda7J=*T}hU>k4^o-Wha?eAp?1tL+JQSkmd0?y4slF6IncYI0as%!A94bIA&;3DqCscy0wNKbBeJQukzQ>^<)IEXzoSQq-DlFEclpAT^<1mOG"
    "=Mi<5#=SG;)-hzaBBazhX5ZT|0&<DG9i?6QKL*|-veVH#juE>B8s%2n_cV+GIk?uzFlx7EqTDw79FZ}gPNph-V$5!>Lb-YNeJIE*<HHm5;a)F|&uV?CHshFC"
    "iH-e~W6T81j9l4Ct7gbe%eR=+Uv8oOXu%+|{roxIPxN~m?SbCHz;23txrO$rJ`16KiWOI*m^MMxN@tk;NC+}3{^3qL?`TvytUjY%Q`9ELGb^XDpBaxi$efkE"
    "4GZ%-9Q|n6ep-trFOU4p%4@j&$j>3J5I?4pi%ztmH?Mqcm|2Mpx4$;bDafVM{)QZQr=sDoBIW1hv7cFa4YwcrImF<2YVV<13+^0qZFsb@9Bw~6a-hLuAh!le"
    "15QML(C^xCZ2+;79d18>fUI$NOr`wmGSd6j@&LlE9LIi%0~Qbi$YV0y8bs4=U<>UN<*|cX8IG_YJ3y9j9PK7;*&TYzR~=z}Rfm=F*e~nA0%oH1WTBisRSs**"
    "I=Ged*strr0%92X?N%qR)q5-&XqQw)c@W`N#v|+p5s;-TkM;VS>#A>^GsQt$y~3?@$A0+=23fvxbR+Kf2JOf@)$b)0r)xRK;#SsUzk~$~m<%L;)YHGU2g#P^"
    "JlgsdZsk1o>sN39F^K%8JLq+umZ|qpx4pIzm0KBTLy48|1olG-$SR%RNBypn*G_w|q2E2$R_Smn+p%Azg98kdE}#8{mtPlnbpPRR?WpVhTW?KkaXBdwRss~*"
    "CnX^3k{%i)>ys%+C)IznWpr3uog}O@sK)A~R)QBi(Wdh0bpLyTT^?$qKcH^^5drfaP*;CTAdw0ZMx3IAq){4XwRc;{k~E>IA5%dxL6e$~P^*TjhM(>qWUCXk"
    "`v5%ee(;yOZ(bgK|MAY3H)df@Yw`AKDJ(jzzgJzFNG1}-)BO3hJhgcCS4`q8&9aCQ8AWNmz3T9hs2y(}N!HsNvLCfJ<WS|f(V(3__p?3c<yO1p`-T3u0Qcyz"
    "2c9T$eejWEk3Dqa=;_BEI(77<`ronRC%yZ<qsI<O?|s6X{lw8@-Z5`l(E<62l1?8zcKX=q>F1W-&CDBn|K{NSigNB>RQBYzeh?4aQcgc`^ub@7b{p1_!K;c4"
    "HjE55xesf}6oW(tuO>2NRgocvks&5Gk1d%JkjRkLM24;^GSo0K)a1suB~uC#8M>OtuvJBd8AgVg+^n}`%0ME+RudV%s>pD|$Z(UX29``YNM!g5BC|R<Gq$rz"
    "Jqv+?1LS9`613GBnz5o)Ia=lX4qL7mCOmjW;UOyv4>1i7F`1lV%ay={hpZ?(bY<b8rs1I`Giz+QQkd}26@`bbEIiCKJj`TfkS$jR6CSpr@bHy|hnt3no6Kpl"
    "<;r2gvl4S#p}Lv7Ta~;qsOtn^_O>#8TcN+13tXkaamW~9pcvs*#fYpfM#MNq#AHI8HCqA{BeJR((bdI>8pnv5Oy#p?OMzlUR}~|+x)?Fz7%`KHh}LWwP>k5B"
    "V#HS$BW@fcZZezFnk@&4(F(lonN?Zc?+l&pcNIp*fi5Wg?!f2VaL#=h=;rg}QwwlD@PygT=Lepsy!p%_E&%M8?RKi~mjZR7FOCdeRb;SXWU$E$SxcrEBr<q4"
    "ks+&!3^9xhF`3wF$&`RZhO8zsbXAd|hLNErlaVc%Qjo~d)kKD^Dl*J4GR$NGwIx#q5*fCd$naG~h8sqPo6P&RWXeGz!&eZQ)ybK$omJ{t02CY`KU<Zct<KPl"
    "6|K_ILcs7~nDF2gg@>#xJj66S#AI23Emr~)9<rkF(3ORUnudp(tY@(0N@2o7R}>z$vhXm|@RXHJV8HM&nDDR_g@>;!Jlr%qWp5J%FgzS4JS#D`6{?%LyH&}X"
    "fVxfqW^XIgw-x%ExxiH!oM4bK!ay;?tBMg>U5tovj5LkokTD`aF(Rvq5nWx3sBw%mmlKdNqChdCtBMg@U5uD<j5MJOAY;UUV#HPzBfh#AapM?iRu@9Xhy%q4"
    "%<B~1VY@3Ay$5s~`oy%f#Q{5U{5PkLJ^ql{4e7lPSKgHlAg(kNDsYQjp(v=}4ccqnC_i}dyFdXvxnJJm5S~2t@Z(2M{pN&W5Dz|H9Y%;N5~V8K0$C~yER>rv"
    "X-AzSiF=r)CCvn>5CW4;*cUPZ*dJiOv1{;+eR#I950}rTx=!>kU}FdHjXgQr*pubP)|HEs0F52?qxNvlJ3#YqPUTfB?t)I8Fq?vN>O|!foB-lF+kV*qeZx|y"
    "c!f~0AyjO#zlkMO+&I*go~p*@YURmFfw->ZZ0)U(>v2P@$E&C^7^=rt0ri;`Lj9c~)JmD-Fi@u!S97pZY<k_T>1^A>f7c(Ae*fU3#~=TVHm`R7<;tyx_THSg"
    "-%z+PSJ^xGeyx-_9y|B*R;s!H8-~Y*7hx-pC?T@JhHGNO(AWq(HnIp?`QmMeZLpD=*a$Q>3XhF0!dAYX8WJ09v?ewRjg7%$V~enrFL8#{1{<r1jX`7M@Ywhw"
    "Y~`ztA+y28YhvS|*qRth7muZtgDI~~uJ&jOKb$r(o-Q6xD@Rme#SYhHhr!vA2H25>?6hGuuwqB*vLoQ^Xanr%LU!8N8d|ZVb=gsHcB}z*Y$3by0E>Lz3LdKq"
    "kAcJE4Z!0I;c*QfvVzC!!UG;@8yRYsjI~vRE%NIp6Bfg51LJKY1MZR$w`#~mKCvT+YZJuq1W6MF$zp;;BS`HClG+3bJVDw7LAsbA)d(^>g0wb43Qv$VL69vb"
    "s1L&2jv%W|kiiq=O%UXZ3F;%Uup`K86LcGki~n}Heq5NmwEuGD?g9Hvn6qU7^6TXuOLhmC`*~<?7@iwm#7!T2LmO_mCN~Vtjlgpwi@0ecF7j=-k(%5HG&c&*"
    "jV|J*jk5^ZaHBQ3QD|-qo*P@lO&eViw&BKVa%0fkI6ODLh?_R1B4Wdh*W?B}o;ER{E*?=Uhg3vsqpLlp!VjuVjH-)=)yi=dF)MhuE<6klk2C;}EQF^IuG|V9"
    "sSA&Q!=nwrqYL5bBdoB3N9)3);P6-j@Yq6l`Y;<<!DDsdF>rXi0eE~NJbkPUt>E#x@PJ3#MuyuZ<89@Di|gkU79(y0LvABu?vg>ba@57hjv%g05W^EBO%NoD"
    "32H+x#&!frZGr@zAZ>ymT})6Le=)HmNNW?M@B~>C1leMO+8~Un9YI!`AcH5!n;^&+6Vygx%<KsA+63Lk;)A7^r5EbY=RPE<FS6W!Z~n^4{bns%PKj{6ti)vH"
    "<l=*z(9SH3)LwGITeSpo|J_CF9`{?gc(EhG^|BYUb&bmoa{|4$F5&RcR{LptyyYbb`|sq7WPUprYQA{ox0N{S<ueE6z`^J>!s7TM6vrz`gmp>SEL<6`%T~87"
    "hkqC(|0$zxezQ@3srDVSQ;$4!`tf5Ao%%mcKKSns9euoX<59iq&AwZ;{-RXEyk!`C;ogp=LhheeX!Wnq^k|zOqd9imG<Ix&UE8v8;hv3#;II>R+$?s|G<ITu"
    "UE4Ez;a-e};D{4;(kyn`G<Ir$UE2_Q;U0^I;HVRJ+AMa~G<IfyUEA$?;ogac;FuG3)+~13G<I%)UEj)@xMSx|*m;B4n^zelm#LJQg?k;EuyeGTrgf%ypD_}e"
    "N~2l0hoLDv?8Y89%$_vPo|v%LwT1(*CvNOX!|Z9}?5PQR-E9N_d+NrXHq4$i&YqdD*99j4V9(sxvxeF8#@TZd_PXVS0PMLN`$j!y1)^hSI@OQlaLr_$U8ix`"
    "S%K}C=}x8Z1PCGk*f9XO=>U-C13-)dph-`FAp$@g13;P%0Bt@1)F=R&`2++a0Ms!6wCMn_<^#Zt0-)(nKp_Ia90S0b4ghaH0Nf}5ngaz4A^_Ym01aADuW1K5"
    "ZeT#iEB(hY<%PJ{SNRgay}sG0A!TM&Yvsz#oA;F6z$H~(ynxR1XoypFK6czRc5HxMH^smmJ9fg3o5fC=#!d{d>wXxzV<%47Nwe5#)7Ys2cFhVy-yJ)3!cLpT"
    "&YH%~46ti17$SG<%n3Vd7CUbmJ2$|t8DNOrv2!Qvyg}^EtBjG$RLV?99LYP{Ow&5kyw4a3P4xq3DFA!y#vV7!o;1#$n6THhCS(BYi5q*;FniiKduqa7cN-4C"
    "p1QH84YOyBvu7skb-@t;?3o*T)-ZeCID2lwUbmb8fIW9(->B!TKy=JZr&@JfGg)WXX<T+zU^`~IQ~7vS--ieQb_@V+Isl~k01%@9XwP2t5kvrpV*p6g0iewX"
    "fEoord$6jHAp$@h13;S&0Bb$~%qRfbQ&W8c5dh{G0M>K>c=G|^Mgh<siRx2`0C2|ufLPG}BHTHz*Iq2D2SQttTaL!umAU1XFIu20e3x9<V7YFsA|N7jxQ2J`"
    "I{?wCSkYUK&w_=$WeAJc_X^)7XEs{xTeA?5IPE>(vi$n64`8y|BQMLrIdx*W%;uk|Qd#7pvipTP(wnXs)?bCV;9OcltfMoy<~;AQgTfb1@a&#9SdSiF1wCv+"
    "PtT$P0D6s`d%YE$ddCgUyyKN8Ug(Cd=4_XZNP%m2<lx96CZo&ON0)vce{g5?!MjB^rFZs#O#dz;sCb%Dm1(K3bboszT9bqO6Wq$bTpq91<n7605f6riIiJkm"
    "HGh8MECCEp02c{hlP6(SwhJ2*zzzfmJONT9Kun%!RoO0LOn^8Lpzs7}kpMM$E>&f_s4)TRK!Cv$U_}DV<mpnC?PA6Rm;(V0Pk<K*aFb_5Rkn*86W|U61Uvyz"
    "Bp{5Q^i<g}VT?dHAPC?Q1Vsda(es)r8x|NN2pkZE@Cd>pg3#!ZOO*`^jS+<Q2#^nsU{d5Eg2|uDpP5wEFyxyeP@l9%0PlsU=!FOwJ@lxuVa8&J9K;a8iy<nC"
    "A;LyaEvjsou^A!<Geq!ah>B*2h|yz*DjR03hR8t;5xg3rq8cJ<^xUAzh8epda&SWg?}n)8hKLzG{-?5G#&U=p<PgEjAu7rt;zm#Msce|B9U=!iMDTWqigt*E"
    "(L;GE8)j^W$iWT~yd9#V9iqVK`8t&iGqywIV223a4pGq#QE2q2oXUn7+aYqWLkw?+xM+viH+t$#Rl~5c9byMN#PD{Ai*|_3o?cVgFk?H!4t9v)?GP935Su-N"
    "rm|tic8DG95X0LcF4`eBdy-6L!;I|^JJ=zHw?kaCLu~dun97D3+aY$aLkw?+xM+vi?5Qr54Kubw>|lo&-VSlm4zby@St=W5Y=_vv4l%qP;-Vd5Vf1*F%7z)+"
    "A$G7s3~z_HXoom3dOk{J!;I|^JJ=zHw?kaCLmV1C;H0u)#&(Du?2y3QAt~A+@r|BPQq?eGY=^|b4hg&+lA;|FWb}xU%7z)+A#t!n0&j<;XomzFJtL&DVa9ey"
    "9PE(5+aW31At6Rj^r&o@u^kczJ0$RSNQ!nysL}H_DjQ~Ohs41S3A`PWq8$=u^o)$kh8f!-aj-)IZ-=C4hlCqF9HX*f#&$>??2y3QAt~A+(d>|z+95HvL*ihE"
    "1l|rw(GH1bhs4wliLo6L2RkJ2c1VhLNHjYnrglh-?T|RwA%(X?TC_u|*&#8tLuzb?)WHrZydBb_9a7B>iK!h@V>_e{c1YpvkQVKbYIaCW?T{MVA$71r3U7zB"
    "Xopm@Lt<)&)YuNGgB?<MJETQBq?#QPQ#+)_c1RuUkiy#`E!rW~?2wq+AvLx`>R^Wy-VSNe4yk5`#MBO{u^mzeJEZV-NQ-tzH9MrHc1VrwkUH2Qg||amv_q=d"
    "AvLu_YHWwp!44_B9nzv5Qq2yjsU1>dJERVF$l&de7448|c1TU_kQv({bFf1OZ-=aChfK3WYHEkf*bbS49Wr=3WJNn<njKP8J7mUo$Q<mD!P_A#+9A{Ikeb>d"
    "GqywKV22Fe4q4F-nP!L7)DD@k9Wn<yWbk&#igw5}JEW#|$c*ifIoKhCw?kI6L#EjwHMK)#Y=_Lj4jH^1vZ5U_%?_EV9WrA(WDa)7;O&qV?T~49$V}~!8QURq"
    "utNrKhpcFaOtV8~YKP3&4w-`;a(FxBMLXo09Wqlp<i>W$9qf?9+aWL7A=m7Xnc5*YwnOe<haBDxdC?BJW{1qw4!N-%atAx)@OH?HcE~k5WTtk=jqQ*-*dd3v"
    "LteB)uGt|owL@-fhupyqIlLY6q8)P04w<PPa$`H>4tB`l?T{DkkZX3xOzn^x+aY(bLk@3;yl979vqNrbhuqi>xq}^Ycst}pJLH-ja#K6x#&*aZ?2yCTAurk?"
    "*X)p++95Z#L+)UQ0^SZq(GG=XhuqW-g|Qt92Rjt-b|{K=C^S3drgkWd?NB(_p@6qTQM5y$*&#QzLt$)(!ody&yd8?79SY43xv3orV>=WMb|~QOP!#P@Xm-d="
    "?NAuop>VK60dI$*Xoo_xLvCt^!q^UlgB=QZI}}Ab6q+4!Q#%yKb|@U|P{7-vDB7XW>`<86p)j^X;b4aX-VR044uxii!qg6hu^kErI~4GCD2jF{G&>Zgb|{SP"
    "P&n9O0B?su(GCO64uz>52F7+6IM`tTZ-+tA4g<{&g{d6|#&#Gu*kJ%~he6Q}1I-SFsT~H!b{II=VE}K3LD3Ea%?^dB9R|jB7&zEr0B?su(GCO64uz>52F7+6"
    ")U`wT%x0(8kB04D_ec`;(?LEX)Surmj$i$F=f=mQS3W9|n0<K<!+tpj1omH;Wl%ZYDjE#raB%<3S8Gkanri0#lR{jZhk%-g%FQeHb(K@8mNgH#HV*?e50{%)"
    "?#C*pNiAz0c5NO3Y91*!uiQsfPJvq1JmT6s3e-GWZeF?nshr-lta;S6c?_s|tlYeE=2<y)X<74_Yx6iz^LV*=<*c%DTGF!Sao6Svpyr8k^U4`x<&>jk%@eN8"
    "3xJvzl$%%11}mo%Eo)xj+Pn~`d11ME<xH<~s?f6Lg^tZbK-PlF)}rl8$}Fq}xmpVXvKCaf7H!W_W??PJ)mjjcwV<-KX#0sW3u{5H)`Ebn1(mHu+bfh=SPOEs"
    "76fE1sBA6TKA_CPT9B)?ARuc&Woyy)_+%E=f?TZy0a*(wTZ^`TC$q2?<Z3Ml$XZa@TC}}6nT53=S8G8))`H5`qV2oMEUX2&S_=ZQ7F4ztZBI>ZVJ*njS}>5c"
    ";Ig%7`(<(qYr(G8f`P0Bm#szH3zJ(|3wE^@3}h|1Y%SV8m)ycyu&cFTAZx*8Yti<w<QCR~U9ANJSqm;(i?%-{x3CuMYAqPZT5#D~w7n;}g|%Q;Yr#O)g3H#T"
    "?JLPGtOdJT3kI?lT(%Z%&q!`zE!fpsFp#z2vbAXYL2?Ug!LHVVfvg3Wtwr1GQCL_DcC{7)WG$p@E!sYg!opgJtF;gyYawN8(e`K*7S=*st%U$t3n^QRw*R8A"
    "uomKKEd<C~NZDGny%mLpwGdZpAwbqb%GRRon<y--g}7P^0kRfSwiazqL}6hq#MN2|khPGqwP^bt3JYr?uGT_;tc8@VMcd0zSXc{jwH5+oEu?HM+CGKC!di%{"
    "wGbd{A!TdP_8<%_tcAE*3k9+kTDBH#f5E`QTBxhFP#|leWoyy)4h$@;h1Rf^!LZjq+e&-AjU&<zaKti(V@dPPI2O%Kdi&h=t(WfKdG6=YtAEzpI(fIy)}!9z"
    ")8}EY%c$!;DLY9|y*}Iaz50p|8JOSp!|#32^w#vXNlC3}{{h^2g{?Ew3isxA<qxVpnA_!4-ed-t@pG@|vko9xpXzx}w!7Y`b?H4B^^1@L9Wu6qtV(JPd#y9="
    "ZYzJ>`I)G1Nw=aPD6AnQ)|11in|h~uYf^p964p@1O6;(zlGMLdO^V61CQGap1p#4YK4{O-U+ZnIpY24&?qIKy;?6KuNb{0f(LpVCILn1Vp~R3Vk9F0LC-sh}"
    "XH|R77I9)7C$qz;N@}$yHMM%vnk<o46l9Gx#0n`QDNCX#-%-sP>+H+>Km5(8uYO40@y^+e&2};<{`9E^HmJvS^4FxC)?ivwtG8EEO|Xkff+EWx$sX%;ykA8_"
    "={*+p2kTL%J(+Yp1D9!VLo2u}Kh-*&R;DUzZ5&i)$9G;~P>4As;wO8Z%saZ#>#ljf?`;+7>XXEgZ-rMC)H<UoYDIZPt+Tx?JF*q!)Pp*d$$Gcf>8+hT5=X;f"
    "N2*sgWVbg^efLJMKNsuH=WmQJJgf1XmT?Gk^!kURD_2J6ei~o+WOVNPS(<zGc>DD%y<d9xRri+`3^qIM;pr)pD3vKs6Ln(5%xAGYogZIZl(4vf#7{^lk|6NY"
    "I15>Fy53@i`5@28XtUQHz@hy5v(bBBRG~bqY3beBB`hRMWI{4OMLbSvR2!xwG4-RwkHU;*h!AI(o#?4vx2^i;!Pe%cYFsNnc2hNb=*o5c(u?Yoqw7Cz-+F&^"
    ";mgulx?iuiSFbl)@6wyZiy@Je3langiBZB>l-8!qX~F`+MdW7@C4K~U%0}taQ8$rkYfVOQeZbwnU);I%`R?D&jXrsyvM1Q9)!VCe=}qdzbd)e=0m2FOc@l>y"
    "uZ<VuILVNtBp_kNqW}yq_&I!lSU-XH;VwOYd2PTclIpxg2&Wm2GFiWu2z;t~?0_YhCs~ZBGvGWGhVLNGU);X+qE1#-ww$V{-}eR#2eA-wCM5A?T)$VqS%_JN"
    "{UjDBi85!Z`)Yj9D*%mX<9Du&zQ3{i^Uu?cK_A!lDn9HO<_vH_ZOA?kFy>+Giy)1VU%zk2QW`Smizo_cCX)yZGBn%yROi49>#G-zDT^tNW6U$kL~WQT5R7H9"
    ">H;JpG2_lK<ujYI-_C!JQ3qrU+r9So-LGCAKU*<+&DK>la#hZOSkeWA8P1f0DRas)9+UbVD@%PENu1!s4}(xT1Kp50NuYD{?h9{>zWGo;F(;MGIV~%vS}ZxM"
    "aDYV|#UTzwNTd1`eZ<v|Jd9Lt9CLz%GsV8_v}Fb(Rsa0*?xnZ&vvFEQ<#|{?r{al7d=jZ2W#+RK)hCDu!z!twgiE3%%)OV)ne{gF8wwB*cV7C(&gCCR-+!@v"
    ">z0o4psq@q^^+<!tcw_DDO2NxjA>TiM-vqZAww2mKOiv&qzNkgvsmXj{~_E()-R}ql=?ivDdWf&et?47ltUE6G)5>5!$?RP!%*&SDeZ5stq-SH?BGt@&;L07"
    "*Gn2%Rh>6e-O`COOJv8-e4cVeCdHJc_4@(NWP&(}Q^^q_seoe|Z4G;ygR`(m|2BH@ol2yKwJn{iv!pMO(q~BNeIRIp1g=dqiju_7(p0IwAJBlp5$&{}maV~X"
    "D+PtR^VXH|v(N4P^{t&RzpF%>SL^LpyL771vXMWO%IX;-Az^;ZYSSe&O7jjRj4~`U6&`20>&g)OQ7c!Rf%;#&2iG0!{`KwAYZphKzOeK2tK*kmtmqM@m3uRl"
    "&+Q!Qr&5B2j3VKOzMn)1PwEeA9C5~F$OAu1c$hW<8>pYqSZiHH1?xGzM*T!9iDKqQf`&fFamxJKs0GVdtP(7g2I|~qvJup99Y~4x+&-j&`P}X#sGp8Wo&{+f"
    "2qFSMlA*M~u7bt|&NxW}B_+<-XJ^(xbt9weKi+-eh28JYRa(VNjr01Bpni%bBuV@rju9h_`!cLemdTV;KjvvjGlZoCCA%SI-b|Qtc^2>84?f=gyy8Tjg}hgJ"
    "^*LNWm5ZrFRQ+F)g$WN>{c|{sNhtj^3eyl%<hyHev=R4vgLc$P)c23tU5HDyJD+|y{@3&4x4s)){b3gDeqCO%t^(8gTAXGoJ5I7RNyALYl-8Fx-xoMSC{yW="
    "6xe;_8}_5_U~=_)*jL9)CJeguz;|BX{rSzEx4sykzqot8!1SOl@35`{P;PO(AyTJiNQECoVI0)I^i5Ibt6@z9C{t3MNq{RhSw}w8+U&PCAQHC^|1o~|JCzA5"
    "n#GGYc`e>yEd`Diw-8vKZ&5-?5XzWYbgRs#7_%s#SSbf}zlD(X`uWv`r~1)Q8A8(Qb<*CMu5+LI<E_#8@A6MxxHNkH`_U^mW~ol=^rm%sGj$f|))(H0(u7Ki"
    "X%f>&^7>a8P>B4LWFpIyFe@hj_}RAyPsvU`t9i3`CZD(1>kXVc)9srtj(#||d*P3F|9)}w!Y#$P`19Yd)0@=k?blhLYjHDy$1IC^5->(d=GV`RGfaIZC<=X%"
    ";gC=Wx_S53ila`at^Bf;slS~&*7HB?{`Ax6$1ivOcy)CB&!ZP^m*D1Adizy+dsP<Zb@>+8#+d428CIr6BZTYsud07WsUQS%8L8gI{R-r|++2_3V3_Mx@0qi)"
    ">`3R^3%mdN`|fN19KUmI{Nly@zZc$CfXA0_%>tgO*PE%gz_-56V&Nx<A&MoAh)*Jm>kh~#ELJj*q)hnkJ;VChO_dp?ec8=t+{sqEn{BE5$hqg;{o~KuH!tj-"
    "yR~!Uuj6mOP=E_`i?w<)wH63l+>xL-Ol7R3D-vmdE$-=H6sVpzilhu8nz+yM+T7|7wp5opZIiQZ{j_`YtKDbMjbDCY`}QZZO!w;X_UkEttba2Cp&$)oq|#a$"
    "N1WB~3Nk+lQ<SM;Oauhu1VFXAseHP(HGp#0?H}JCy?#C)#m>Jw{;0xW4{DrauwnhX4^$}^MVv-)%94axT-T*Mj)No$2}4O7yQf)*4A)y5TLalz>*s45lBnBt"
    "|NZa$;~$9Z{P@*mn!y)p3@fh68m@bJmENRE@1V-!Dw_HyZ6*<lP!dIyWqyk5U)K$CGv*>CsgJqO9Ow?zdrAKBBO6^cj<g5)Qk-a5zY91hXhv)AJimMG`O%A?"
    "kBWoVUQOO%O-uLpT9$vJgo>20h$TT3)*r7jnqh{O45ye1ArS;mrRlAM+;X~9Z*W$P)EfX~$M1f=m(hNEd*}9*S-7fNuUM^jQ0>xv#+HmZ5lLB^#7RhGDp>u5"
    "fo3d7V~#=@Q9s5J1m^D9jm`DRrLA^-<*GVquRgbX;k}A$T6sO*VLgQow*EDjI7U8>V-aMj#7tPsndLGFLV^$p2+8Nx0I=Nbsq))N)M;(@d+HNI3&W~9Ti?1f"
    "{^#w{trx}@iYl;QomZ%?K-S{o3ss#!On8U`hGSn?%=tzER#GL@&=oQc(iu$0tiiAsL7bxBe=+*-rSX+-Mz=4_@|=!RdzBO@3X6$_u}o5B|Hx-p@cQRx8sku~"
    "6bIA~QWS!mpTl-OvrzSJ?XJaDtg18f+v}qbKHI(e_0H`-74p`+B5$Um0!@nnDnx0*1d{<HQJB`hw-`&+S;T3U1qtU-;6u<%dRtvJ{I=D9RCc~5yNQH2IbVC_"
    "?z=a3ufMYU(aWO?g?Vw+6&BFeACyoUN=7kZ0-=1ZM*TsFhhZj|$g(J)lqMi2YCqcAh?J@J&J5Qfpq{_9{o^O2PhJ_ldZl#jTGitn)Kgs1WpQC8Mid3UFB$Wr"
    "l+?fAN~si5s9%0U5G8^`z&yCYGT6))-wk@5EuevE?>5V~e;)t%+UVL3J72$3d9!6wuQyX~5p(_PE3qFYDT^YNdnzOHE!KDmbu2?!;;ZB=6cPe+UuIitQnvOc"
    "cgieNtptF4_x+#8*WVbw{l@rTua3U|bo-~vrCSDht=`^z&x2Zvi0fZqQ73OkC<+4<rzGI@Cn*XpRS7YRX_(<4j$sfd{jK&eziXEpmKv`&Ae43d(xu(!F5dm<"
    "hn-7Ti);_7^Jc0mqOG63rYR-?O*zglz~Zp}?ZPbdV;bX>N<Tr$4j|9od~jKt?u-I<?&eots?XYDZAGy4FS@XZu-v&w>=T9=vzVSJ5*&pr@dFV`o<V@!U(eC*"
    "KAmUnYm>%;oVEKaJ9e-CX?*3=s+ApDokhYHOX)}&QJnIWafK<XFAFH8RLC&S!qktG2qc3YuFHYk8su}2)_W<)b(g<v-?^IKGI-~Q@ki$i!Z5ANJE*Hjw0^b~"
    "B%ulf;XD;_5@S?<K1N14MNx`4&7?YSfwHZ^px^5a_ZQJYK)rHn^vxf~Z(SR|{9GyNn%3nV)>VXBKlx%oM)C>vjIh{`c>VctQ6fYll8_LBRPF)d2ZPR5JCUum"
    "eD8zl6(!)#c6|ND-FI(JuV~%9^!)hz>xDjHQoWZ~zjr}vVeeZ%M^oO5h0jS4M?r`KWU>0oS3d&or!+~3&nX1-t<9GDLq;2|ZuInCM+ks=`{sr5&6}fZKklCY"
    "Y8LWAbzY&mBHH>nT9|~&q5>NE`R#C#+3ab6GA=2`oFJ}7Mu_w`>P8)9yGgIxjoO1j1e5>n-g$le&u>RBT`W&t&a3mZ>WaIb`4(3e0+9wmmV}W^RZm=hicFMd"
    "%5?L^wt>J2$aR{HUYtKEQ)Q>AY-JrOhpqLk7$RZ&{PyU=7rQrZjxWBsee>(lox)X{X|>*@T5nRVH?6h^xqiMDA(n|CQtlu{fNA{;-*K8m`PzLEi~J%3i1FrA"
    "D)N(PI`1$Uf?WK5{pFoYS9YI!Yv*>sclYb^X6h<JwYddO1D;SOXeLq~)xRdDlCu2LdBRd(M5^0v=*&%f>bt<6y1VDE-@SNc=daI=KDn{v1m3H?2)lmH##294"
    "eQzddEI3N)4{nT#IOF*Q@EFH_3UX0A-&L(OkjYlRJv<AMtzEn`y8hPq{Q1#q-;b`oxP9k?!a1yJ^JZ!*BDJ_hj#Cs!=KFC#6GCH)Ww|I5G(|XwA~n2$bPD;#"
    "5i@B&gq2Nqjd<zG=#7izT_cJ$6@fB~b*0LCDN_Scei=5bZ@nC4zD&Z<PjQR`5<&sp?Dsa$c3>QLO7oj<?!Nm)ndVG2MU?fkGG7EjbrT_rWf~=EeJel-lPrky"
    "1-db&p#VZTY;VZPy~SSA>kMFc<};CBd2RRV)e_IVE^oH3BGmd>S<1uwo?=J^V>Gt8cp&n04Ed@6KP4yw>q9r9JQeB!8SHE~x^w$R>89<Z8!c8?1Y1AzN<)Pu"
    "-{i;_`HWX=F*qezzHkO5SS1Hk!rg0(`%<Qm_ZoNJy0U%ibNyc9OhrYU^|LJ*`}z77nMx!=mWCGlMFqa}sZ{?(DsKZxWV4<+Z-(leX+72Lo$1JQ4J6t6`0sb0"
    "dv|o_;?Dbj-nsJW?zQJj6X&OOdb4#FCvVlyxH6Ikaq5Q|!G6ju?kq@5Q6f-`C8a2fB%DgMHdJB>bme=t6L|m6+qadyepK!U{>Q*Otg*<oev*}{%qU_aihY!%"
    "3QhexHYv`e$|U>{XGp@#F52JeOpPP|DHD+EhzGmKY4>aPw>UejtjM%}juqr9Ju#IiNL8lg*Y66#h^0Zs!c^HnLSndc^-Qn-)S%UF|3AFFS(h8PnehKrc$bU+"
    ";i#~qeDzAQY%8%X9Z7LKS30Oo&4^8MNVb+-*@?H<<2ar;USfN^WO4G&cuC^eiP!J)9<jUiE&eF77gnK2qJRgSIWtzXn*~0<rwaH1RSyVys($&$*}E@Zyl4zp"
    "^Ts;!#;QcA!}gppMrk1_p*&BO!+JN$5)CyWS<Xq8!HreJ-Qjq&Go17$a1X}3Q`RjTgH@%aD$w@UPdTC5i^>H;QlO;$4rV;XILXWHp%7BEHPCXmmZPtCNPZg0"
    "HQxxg*!;zyxBT)Ey+>7Yw|vZHr*rmbQ`i%L=YDw9hQpRd<wreUP?~>K`|WY-QN{pKUOVcpuBNJ=cYeI96{g=;XR0q>-Rb51%pefEZ9`Ni5IYlC^X+2}dG7t}"
    "c&WS+ruj`|)Fn)U+{0v`r}JY<zt=dQ%`bgoPGK_lFd?qm%X>fjnLcCB-pP#sh1*U!^#I*3SOR&${$!^&I=M`r?3G=)5pnFcdrduJ_Y0IlT%c!nb#P-f>72{^"
    "(|U}?H||(&8dHmrx?i1?0>pTAnvX{14hvVO!+~+?QtGx{OFc;H9wbB;ba65~s(*g8x7(YVeGp}C`=iw3bnk;GL?3i^a<iY0%8g$hA7*AUh1*so^&s8*AqvqC"
    "Jz9P#P3Pe~eN-dD*lmlDdW7!%4uj}-&JS;ut7Ar&!;CNaa`GPL-sLb1Gmwn*NO@lE4vh%w-%cu>l!syW2q8Mv$MS4%qB<AuOvfrU(@5PmU8x7@-l;MUGCGzI"
    "I8S^1sWJXD?zRg`Jwomtp@dMnyJNN6%No?2Nw@7u>H$jk0Arv4kB1B+#Mo_*ka~#jeJPJ1MvLL#MsKh;IdgfE?`6a0bn?h;$BtU8JaUf}qGNqb{VdNq=kv*Q"
    "&qyc7ZX0LRLv-(1If$;#mj%x6DD88*MvT;L^NM<m?j0-VKxs^O_NIowaqhNtL_I$DZk0=*_-^bfBRc7}pF=%5_db=!AQLJ*kGie;eIvfuZDWOceC{2pfRNJ*"
    "w|bK_FK1I@qmvQHt+croqHq^fK_L8lNA(8tbq*sy;#Of?50JPA2r(aiNH>)Xm0_lWxt0Fb!*ibo3juWrcCIXH!W!4mg>b9Ntq1Bp6&4VE&BNndO*`lG|G#Oj"
    "X^7aZJhmRAdw(M#`kSLPHd~EEj%BO0Af<bcBMHcaajKHx?K9<nC%1>@%7!G4g`@RA-FqGh(epf^_WJV;U9SvBhTll$Sh`sc(!KwY5dF_j)HL0h&bI@+tmDnb"
    "=8QuM$5P6AsO~+G1hJi7ek0!yYV26tSP#{`BZ?t9qKj&j>n^DCXs^g8>XzBz#>lb8uoh_S-WkOZbF6da7M7hK4W~Q9@xWXdh^b@YUp-9sX;uufewFU@`u%e2"
    "!$<P8$!25jSd3Q>)P24cOOWN{!E`+AcOF~3wH~E(tbVIU={)a>BZ!5b<8Ryki5fTDgpC`%ve-q3^l{w7gy@AH$<?j9ovWk8w**x~M2;0<^$?MJh!`-FKN^mD"
    "6C+6MSdmo^61xWpVSEp($#kqnJNYy>V<e6RQuP>#dyEhR$$2%_!{mxQQpdWadW_UPMhKxjfAS4pKibj%o$MHaGRJD6dZ5fbP!1aCqrJi04b&YYR_<8HQ;(Iq"
    "$0}fxI_TYMxIl$tl}$ZP;U1?1jq{1#WM~d3(y{KP9;SyH#Gqkb8!oo8tcDpoR-x3xbe^EZC;|=hq2c&O-g!jr?i#a{MN=+CBDH9dy9gnW>DcZ_rPIdcy+s2q"
    "l^XRJ-AxFAEJP2>jql4%SQ{UNT{PlSIZ=<(T@(<^Bchr9_~is8KXdf&b9?E{e#6<z9P1kD5xbA3NB})Np?1}(^H(@-6J3weeSAR>9q(g0i7O(E9jhto5xV!e"
    "7@`+?JkPW8IrWA$+eHH|1rD_sv3oCs3FMk><E#^#eUOt2VfQ`=L-avEQd2cH?l3HlT@BC4fv|gr15#8{K6}5bQe#~Nn_Z2Q{J58s#8|>CTJCl(5BvF<`M;V^"
    "Rl{eollowHpCu5Y_uyFF&`xkJ@Arqd>p>F3?}(H85O=>L806k&xgGTtJxH31dBj)*B2L~z+!uie$O6gyD?58>a~Z{=jcS-qvP0b0NC=10fOGx5>_%?f9$K_e"
    "4bsVVi2IrWNc~S4WTFP<xoUK<#L0Br%YR}5wpP$^4}Nj<YJg6fLp*v_2w5$=(|kPC7ovHN8n#ND9LK$&DW(tu$CdIcYv*NnMQ>7n`e)HZHA*Mdq3$CGNZHn-"
    "d9fx)L&}Mh@3_}(#T0`)7PFg|bI5_IbkrOjoivBKkB*c;4I5AN8l;>Wa}Mg{IMjX40aASTLv?%785ZSN8Fd~tpG%L8@;gMGJjcEME(WQ;do(|qJf124^`pl7"
    "Bt{7yqE52oUV|4?2-$h4{KSo`b<{8&>SQ|9-E=5~30xWW`^OI*nwO?w1Jp@(sJjg?h@tXwZ>o*FdGU%F10{7b9_Bt!f)wIi{g1s>E09JZ9->ah<6emugH+;`"
    "`%0*O=e!!Lk^b;!j(%<&RhZe^I{A-#VP4E2dfN;A@@riO)ABn<o0DsHwN4Ji+`C$k3dHln+x>F*JilYE^)R!ub&??W8pN0hkOk&+JiIes9yl}q_q3O;IDL(Y"
    "CUcS^=04E`sk(e<Z#Pf+%BWwDjiO7$oNS1B3@soVX=vNKFfjDMD7Zw-Nr2odE@P02%PV<SF2tIT{1{c1h&lO>dzod-5zzCL`5j|s$&HyMb21<9KC|Qy)2_?8"
    "{>a5%zjLkp9?)L7GtrqRhUK>>9L-cN=fjcl9O<I%YWPl4#NFp)AQh&MsoQ0s=kETj974@GnNehln3EZ~SDD6~f$Ueb_$KWi_ow;;PWOz*Vz^-m%t?p1yCr~>"
    "(>{`qck_u>z>#^*8j`@AM996OHs%7P%N^~FN5e^3{XM=r(!G-rsVN6eI>g=OfCD|t{vZ0R)#vTws@FH7Gz@_|DUf>&aST#Je0H4f3<s+!YGR|37;z^NaxW#0"
    "1;``&y~*9t&feq)lg_z49f=XBFpPmaDUonD29TQRr9iKZdwaVhWA)3ZoJQQqjarmWcT@6!>LsJ{8^pTFoPSsKsy}sm-KbW!@c*S`8N%6%=Pp;{zxK$5>*s!a"
    "<-rS&cg}RqUR?6tM=o@ZesT6<=VE7Z<P!|1@4J5X;`NKyBcq;yH$GWX#&BjdIdl5{GYyBDV>#Iq)b2gk&z(L0BY2)T7*D*OCpLHrSDx5`Cl17u1mj88^CSjO"
    ">B^Hh@FanF(qKI4dY;ta8N2eN4m@cfo-7zoww`BQ;CbVdKvry+15Xx+ClAJxujk1Pp2(Faci_oG@C-P>ZyMnnhxo=PoHpZe8smcv@&QNrO~ZWSIN$h0l^q}K"
    "0u_gXO2R=U8=xA4edA+Xc6^8nR1yj*4F{EOfNG5RjgOAm@u4nIX(*^H98|UesyXa)XQ<2tDhmabhl9#DKsCpH;S80#Kn*kchaCPlj{nU9;5LVHG=Ojl5YhoQ"
    "N<gy(#O`FV6ImRLED1=KY$9u@0FB(q5+|}G7+D&SEZs!b@Bxb4$x<h>G#FVHkSyCo){p{<-N`a1vMd-`9*`{GMAk3^O5DkEC$b^jU>M8{F0J>1OHEclohDnC"
    "PMp9MOZ_MB8zS>xnpn<VUVB62+~wvQBDDQ<>G)7>PPF6q_@8EtJaI6dcs)-;ktlcNi5+<2Ks-q>o@6~wQ;dWwPvXFn1ma19@ucf{nmQz1c~S?SG!Rb~j3-;q"
    ")0Cjtl_zuH$pZ1@!FclZJPq|>kt<K`z>|mI8E}B#G{QFy@eDa3bsFP?4e|j;`Ax%o<2cW-GgRyX6^DXK!a*e)pc;ccBhFBX3se#cDh&sfZh&fx_>4M3r7lou"
    "D5xwPRJH-CG3+zu43)V+Wuc(*a8UUMsOH$uouP6Us9{F`ki-AR@xNIB+~!b@1`tjGLOQ@k323$e=}s0qk;TEtl7M8%CbFgq#O`E?6Il|BEDcDOZX#>=0FT_s"
    "QYW%B7+DsOEZaoZkOGd}$ucLhEEriHkSyOs)-VH(-N|w%vH)(N(UcYR4KH=?csjzB#c>)jU%B+-YZo8C(0Ou=D;)jJ^(UKjfw!N9RgTw&cjb-#$S1uU1697Q"
    "@kMX!SC5a>2>$BDhaW$C?Z;Qvqd)np74X~7)@ny=gTMAx{{&3OsyD5^;J+YttvqNW@@rStuZdl|vSLk)x1YbA919%KFeIN#>+v++E9KmUPWyYMr^RRwBx*YC"
    "=MS7-vODF5!Rw$LeDv!6i%%KFbBhC=(zyTp%lj`qd-&1M_y6(IGKNJ<ou!r>zBPU_>i4Ec#dDlclob(9WRzuus_W(Z|7|o_x)|3VAX8F`0&yjZL{LJmm+zV%"
    "z?-Mqn+`{lyMQ=<Kl|nD4LDC5a@o&unMR6uPH91L&I=N=s5MTR@i>);W<)TgqO=vxqYHQE?kFEmd%JmeI93{5`H(}yYvw)u4VUjD|9<(xm1`FtyKw!|m9ys`"
    "y-<7F;pEqyqhB{wJJye}s^*cbt$C~;<;=>%HjgXz?{77@IPk~e`C}XY*x)Z9_+wB0I5d9}o<FhSPYnJNf<N)(PeSvj;rUY={?y<fL-41b{Ap<ZEIfZ^!@s^P"
    "LDtr6TJvL`{8?!JJUoAH!=D@c5d?qk$)5-1zYPJhGoVHVT3ZuphtS)B!b{LLEXYoS8a-%j4XHgt?3)A}JPBkANg!59Fl1<L&8a;@;+q5#JPC9QNuX9qFpOwz"
    "jjBCE>YD@_JPB+INnln<Ftvz-B!T%Rfdx+j-$D|&RT4}$5+F(7zDWpdM_bV&OFwEBq~$rX8^ta7%~k}*(r}s;$A78|;5b{5oUK@nrRFqx4vk<kLA*0T!e@eR"
    "BNNmv6Nc<i1d|Esoe3H~6KorqV0M`>jE7>FOfc_Eu<)7S+sFjB%Y>mll)z+yduL(`;v=?^31OEBVPt~BWI}jnLWIo3FuZ_XveD0`#|;Seo({Kq^q?iWJK@ni"
    "X@l;`Ms(hj*e3&{!{O0k8+3-NQvrbv`=V=p4dRJ{<;O4$bWPg@7%{HcG=NaQJF4q95U_tgNQb$GKMv0y+weC}-57#D_T-O4^C#i?6C3`<<dQ`Y{D~)j5}H2^"
    "&!5`xH>Q*fLGY)Z{Ap<ZEIfZ^!{3-lG7Q0=dGcqW`SbAnxeb3~`p5_bf9}bj2j#yF0kSioMg?NjI|bej6kdY1VL^5p)aXHsfg}O@CIJUe0@*?mh*c6y8R8&G"
    "AihZ;!IMC@kOXR#1k;EFND`=T5@_%wuq`BkStY^LA_<ZN=9>f-JPCXYN#IsVFx@ByNdosxLSQ@EiXK_|QKKMn|2Z;%A#FjCw&F;ZlGJEP9KmD)duIZN&ji^<"
    "CWu`o3{~P7CKJRv6C`{l=r%Gz?J{Bb5+^X3px&9F;WNRukqKs(2}7DVg~<f-&IAje3BHX?aJx(x=ENCHCb)MdVBG0=|BY3@fVi`3Y{X%tW#x7pM)>PC<sjT|"
    "mTj>?N6UkNr08_Nj@7?{NK?bc9Y&(oY~Nv!Sigw};eNAms|`I`9|k00i|s2KUWT|~UE9aP$WXc4$Hvr@+jKPM#BXwbeAs{hZ*7O*6IKYHXk-|BGkn4UVlP$W"
    "o*Hy_)Od8aeAcA?LhF<7;`y^zE}nh-`XgtrT>kgkQzl2h>nwiPwDUsc-7B|U5bLI0l|!6qK49~8Z}U!<OWh7K4hb1=glx=h1@?oCogw3JkV#0$WFur_+A4@2"
    "Wa12&go8{&LZ%xb8#7Wt{UB3k$TS>e77{Ys2-%oy3g!oyIYVaQAoGxr`9{dbJW_B!$lMt+4+J@^URd}=vtS4h&K`ylQZd3hhJ|D_TZZ%`jonG(fTT%K(quDf"
    "Q#E2w(!`xK2}qg-B~3SzHhe=yo}{TeX&R6;3rd=8CT&QEM4qIXJ82e>G!IIeZzgS+hs2(wxjX4#?h#l%Z0w^^KcvsB(91u93P@lBu~Cpl2a(hlH}=4dL*gc3"
    "aT5#NhKNY!i<@}hCLwXtu(+uOZqr7%FK+6An})>A!s2EYxJ@MyzPOnOZWa<Z4~v^y;5NNP`r_suxB<+h;RWw|F3S%yRAD#OrdDHHRhTMWr;qDPQf=ND4l)i2"
    "8E=Gam`EJ?LB`IIaX82%BxJG?vf&>w@`FsAA(L>BX-LR)BV@xmV(bT*Izy)6AhVE=*+$5QYsAD4GINH^!a?RCA@hxp4a113A7t(fIh0+5)e8&1XcUZ?d2seH"
    "jF5^E)-fz3quDaJCu!_X8V4jzf|4eiNt>!6JV_IG(j*{h8k98MOxpAf=}DTplcoVlv!JBeX40l~#Ga&?J82e>G!IIeZzf$g4;n?Dq`5okVD1rEK5XoxNk3@h"
    "Gb{A+kDvk)*g$L)q{%^Ogne;i58OB;ZW0zZvA|6X+{70*@xV<&;-+D7Qw!YGz)gK|QxDuUByJWKH?zRa4BX5YH}k;FLgMCOadQjYrk8ME+}r~<fSDYZFE+l~"
    "x+t!W-6&kFvR_%XSdDjG$s&zh=am-4iq>!U&%<er;)>V3bJ0+pSk1<o(!^@$>+2F}<U0Sfsz_{c0ROBk>gejPdEb<*70^}F&{Tg|4Rb~DA&p$8qmE^V)~s+~"
    "R(K;TL%LDq#|npHMFO)T8(A5~jF2BI5`xt*@HKd8<2Bf{%REKcoz<mK*WjJNte)J+s&Sw|#GRGPhVqlWK{v}MX+Fr*U|K%iW4zM3Yrp#A$FDzl;p+Jdk3V?!"
    "@oTlGd-N|mOTTQY@~ysqRhcha`=u(?W1LxW$mZeH?!7J}sV!|BmNwo@8ymEVFKz5W8;7J#!qO(2X%mAs^`%WbXp@k%X;|8HGi_?nX1=tk2W=XXHVaFeZKll("
    "+T52m^PtT_(&k}l^UbumL0kCJ<{q?pFxsJ|#KuaRwM2RW_wtgkViMX+Y}BOLO=554*atZdikt*SPArfcg0l9DSnQ|~ALJw`avB&pwLorI%G&Q<v7<(Pkkg>Z"
    "SzzSM0=c0o40|JIKFC>6<UBBPZh_qJ6-K;~b06dZjU~9USUF3hv@pN<rl++8)|TMjVkIt(=E9gickIO-hviN}b0;?3O?~11+=&-=5|%p+&7InCHyuX!bEjV1"
    "X;|(oG<Rmh-4q$=&z*U3XJNVX(A>EVchhEKf9~9iJA}_Pz2bjYX!-f08ug|+<XV6$3XvIipO~&MMYelyNZL3oZM>Pb;V&Hd(#9UNaY))EEN!xxwqY$C`_d*J"
    "v`I+XG%RhpnYQ67ocPkF9<*sl+AJ(>wwbnJD4hDzW*)RzNZLFsZN8bd;U%2;(&iqt!#PQ4DY3DVW-Z}fz`eXAteAv06B{*Yb`#-^9Qz>0L6MWd$cY7VQ&6Ng"
    "a^i!W1Vv5*Bc~R~O-qTrky9V!G$?Ww7&)^*Zm5cgypb~><SZz19vC^dKyLVoK;Fo?5AuM<5?ooVoTX7(gx`GA(^>*+OK@+o5|>7E5yYQ6_TrAiawnm=6C3V^"
    "z6k2iop^C4VY$=L+^G$B!(jyT=T5!2)3DrGXzt90yD2i<pF8v7&cbr%p}BJ#?xxKMf9~9iJA}_1mq|Cj+`7QZ;BOR4*OIWZQo0uOx>9K-+-Iy7#nLSf0FaQ="
    "dg)ca@J~uZ#dIw#Yf7eT@vpC$X2N}DYgIMf>JR|wSrj4~FZ$m|t(79y^3hZ~U5j-^@idd}6J5vhX-j0o;K(j*Ms}$Y8S+7PDIBsp!I3?=8Cm0XF0l`?mPN0-"
    "YV^Rg*Uu*ptiv&T=d;<{-|fHq{p{U0s#t2jIfAkHxgNh6D{35W^k+KL+f_I6$(fXN%THJ4syqMnzl{b<UDt}gEPp%y!`28eJOW%rfDHt(Edp$f0DB-H@CZm1"
    "L4BTy8vE78z=$;h;(>s|BcN3T)Ifl25m0Lc)B^#7N5HBGn1KM>B4E}Cm<Iw5kAPPZa03CcMZm2Qa1R6m9)YML5C#Hji$GW-5FQ95JOWuoAPoe}7J;-zAUzPo"
    "@Cf26g4jU7Z4t!Q2x4~xC;~??KjbNb`Hxiu!V&?BY!T?cbVmShhp1|Y$go3cYlq0%4v~i)B6vGQRXaq69ZFj}MAmkQJnRs`+aapjAu{YRwzWfKZHLIi4iUT^"
    "qN*Jt!wzFxJ4DuYh&=2N!P_CK+95LRFt)WrWNnAY!wwO=9iploBEt@2TRTM7c8EOe5W(9as@fqk>@c>qLu74-$iog1yd9#d9U{XHV_Q2!)^><I>=41*A*$LT"
    "GVCz6wL@fWhseVYF}xk(svTm(4r5z8#MX9*J?s#}+aa#nAvWwVwzWfSZHL&y4l%qP;;J2D!wzFxJH*y@h&}8O!`mUQ+99snA&zYA5L??J_OL??Z-=;QhnN}&"
    "Z0!(R+adO_Lkw?+xN3)(83=6c5L??J_OL??Z-=;QhnO1(Z0!(R+adO_Lkw?+xN3)37zk|b5L??J_OL??Z-=;Qhgcd2Z0!(R+adO_Lkw?+xN3(uHW1j_A-1+d"
    ">|uul-VRCC4oPGnu(d;CZHL6e4hg&+lByjNWFWA$Lt<@*#KR5=yd9FN9TIFHu(d;CZHL6e4hg&+lByjN!w!+H9TIChBp!B1;O&r9?T{FDh-~eUSlc1-utNfG"
    "hoowU#IQqTYlp<z4vB{y5_mf#RXZex9U@yhB-VCFJnWFb+aamiAu;R_+1eqownO4!hXmdZN!1RCVTZ`p4vDoL5)V5h@ODV5c1R36M7DNFtnH9^*dc|tLt3>%"
    "YS<yNwL@xcht$IkDZCxhsvT0p4w0=LQfoV;9(G9K?T}XOkQ#P~Z0(R*+adL^Lke$)v}%XcutRKXht%2*sfQg>csrz3JEVpkVp}_;)^<oe?2y9SA+6dWHS7@E"
    "+99>JL+W9N6y6SL)efm)huGE*skI$a4?Cprc1WvsNDVv0wsuIZ?T~udA%(X?TD3!J*deyHLuze@)WZ%bydBc29a6&%v8^3aYdfSKcF5rEkX7xF8Fq+m?T}g9"
    "A@i_925*O~YKP3QLu_k@%-Rl_haEC_J7iTmWQHALTRUXdcE~*Jkipv_tJ)zm?2y>nA+xqa=3$2n-VRyS4w+$x#MTa(wH-1KJ7n;7$f|b83_B#YcF3&lka^f4"
    "gSSIgwL@muA+fbXW^ISe!wwm|9kQw&GQ$putsOFJJ7gYq$l&deRqc=&c1UdPkXhRy^RPn(Z-=aEhs>};Vrz%Y+76kA9ddX(<W)Q5h8+@HJLJ}O$UW?k!`mUR"
    "+95aWkl5NGx3)v>VTT;v4tdoMxnYOI)(*L~9dZvl<nVULt9Hl@JEXRD$gS;=d)Og|w?kgFLvGk1wY5WTZHL^$4mrFX@~Rzj!w#vf9dc_s<Q{g&;q8!D?T{OG"
    "NNw$qTiYS`utN@ShrDWs+^|DxYlqz04!MUNa(FxBRXgN{9a396<koh`J?xOf+aa&oAvf%h+S(zvwnOe=hXURXMb!?4VTaV#4u!QH3J*IJ@OCJwb|?%xq_%b_"
    "tnE;E*r9;8Ls7LuVb~$HwL@WThr+`S1-u=KsvQc$4w<bT3TrzQ9(E|;?NC(hP#AW|Z0%53+oABVLjiAxqH2f2utR2Rhr-$pg@+vqcsmqTI~0Z;GFv+o)^;d7"
    ">`=hlp{UxSFzk@o+M%$vL*ZeE0^SZq)eePWhs@Rvg|!_D4?7g_b||WLC=5Gfwst72?NE5wp@g?XS+zrH*depELuqY?(!&lVydBD_9ZJIvnXMg4Yde%4b|~TP"
    "P*&|w8g|HR?ND0Vq4cmr32%q8YKPLWLvCw_(%KHChaF0IJCs#Bl!hI0TRW82b|^jUP{P}xtlFV8?2y~qp|rL`>0yTw-VSBe4y9p-+|~}IwH-<iJCyKtD64iT"
    "4Ljtvb||gwP<q&*gttRkwL@vxA-A<dX>Etn!wx099m=X5O2ZDhtsP2hJCq)F7{l9PT(!g4utRQZhq1LC#vXPU!`oq8wZqu3LvCw_v9%q>?siDv3wBAhV3(K$"
    "yWG+aiFLs)X<e|J-x>9XV>Rs!2M?rboJ}4;ghi__iTz)Fc<}j$vzI@pl30HE2*dGlP6!;ou*{%w6JRx&<kQKSrH|H~e>5HDnfXC{!$Uyfp?Y}rv%GPG-%a5m"
    "-|#R{c(@*3eSXupdGDt1uy1$-C_GXRuYQ3xZp^zWJmMQ31qzSW!>i9r8aLhD6dv^rj{$|p>fzPr9E}_5ZVHe2hR1=z<Mr_B^NGgIayNy?eZvz#;fZ>9^|?ah"
    "M!1{86Taa|pzvfpy!t$#ag*Ck;Yr`{VxaKidU$omZ`{CkQ+TmwcnHW^P~BRL{mNqpYeBx&f`F_A)vd+Yi#&F)7UXL!2*_Gc-CB%&#$yL-LB7_4fUE`8t;N_w"
    "Ja(`a<ZCSm$XZa{T8#a{V+U(NzSe?(tOeDr#n}5hcCZ%YYb^-KT2S3ujD5Xh2WvsT)`Ebn1=X#^+_O7!&=%yYEeJ?kP+eQh4Y?x+Z$ZA^f`GgQ)xE{sZ98%h"
    "7vw807)V@jU0lqqv?B*|!M^5#fy@Qh&Bfd&J91DL?5i#qNL_GUUCd3eBL{cEzV3p7+y&R&#n|B*MGo?UedPrM$qTN_i?Mw*iX7|(``QZzvKL&p7h`W~6glV%"
    "_SF{*q%XLxFUH2xD01)@?CUQW$X{^XUyNO)5pwVs?CUQW$X{^XUyLoI5pwVs?CUQW$X{^XUyS{r5pwVs?CUQC$X`g^UyRM35pwVs;_EL2$X`g^UyPlc5pwVs"
    ";_EL2$X`g^UyN;<5pwVs;_EL2$X`g^UyNJ22s!u*@%0x1<S(S|FUAJT2s!u*@%0x1<S(S|FUIc42s!u*@%0x1<S(S|FUHo$2s!u*@%0x1<S(S|FUG#d2s`)-"
    "@%0x1<S(S|FUF?E2s`)-@%0x1<S(S|FUF3=2s`)-@%0x9<S(@DFUEGn2s`)-_4OAD<S(@DFUDTO2s`)-ZQ(DI>2Q3vn+=D%59E==iWLkeIn`0d>mFMA?X&m3"
    "dg;u;)8Ea0^^6(p{I`{0FY3>?H|bpMT<+(p8gv|)-%qzX=F`u65^{I(+Wbh}-n^miq&w0LH9h3zbewjNfURUoBS@y#hMj9W!%5zGbU3)tc`#R51?*8{)i3pM"
    "0$U!bI~{hXWozBOZmpZ?*4*f>Iv5mU1c~_E@J{Da(K**IqpQG0CS2qOS0AaH4DWP@MK>wial~pI1_~$!J!i-HWTd0%&7)i5iA|o^jVCV8uhV86an_FlMU#N`"
    "s)O75b9XLfcXdE_JC}R&XKyFvDSK@v?_Av*R3Q@+GI4`U$}V!=dUv>Jy*oN;y*vY_J9&4qH*jQcd2r{H#8{^Tk&LBE>4A<rr)2r%qm(?+OM62-(w*;(%i~o>"
    "I&O}1ydD1ePxAwHZ!H??rt^kcl3slrD5wGwYI!nWn4~*uIvjK!)F;C3ZcQSDiB>qF73FoWPq6%`xo);-&JFO&qd{SokeDCr-Rcc=x3Qx?oW9tqgr!MXIuX_f"
    "(iqB?x|5@p+~77Hs2$g7p6(2W{o#$f4<u?j?dK1u?3Nm&d8Ye*HJB8`@ow4q-_F%&IGC&?eelt%`!7CaAYL5vl<)ojdGp|_k7lpDIs5j*{g3}Nd+X23h>x4@"
    "EH~XbZMr%wXkvdF&T$#TWYq6XuP?xfh*7~gNmNergwpHf`>V{?A0UfTm8W@18AF7k__{aj(Qq<V)4Z$3yTh?B-PtQ|@Bj9#!>69zfAJ5qXTPkVJ!+_P+)$Ne"
    "+?plJs7weY1*NeNRJ3Lp6?zt$Fu}4c5ttWnEP>9|Q<~<9dQ5Z0x!Jh&^?DphieiDIB#P3QM*_9x85cz=k|-<km_%tp{CSRV4Etr*5~L$|^ZVInukF9^!ogSH"
    "uj~$vK7dts(74a^24bm<I7?W86V64!S|dkA5~)I|M34-t2>BzQ=DVZeSoO8tjr2dJ-SW+&-CRfG34H&J_xIoU;{F?-@4xox{wtp!{{Gq7AD*w!K5n~n)OKgN"
    "?J8^1nl()^$~ek!o^zEX?N4uoczN4Y<T1{fB+8rhVv5*Hf%@M2U%xtg?lZIFoj23b%{2GCjT>WcAR#lw5keY-5SXQ{Q8FCSD5IIoq|z?sKZ>P0`hyQAqn&)L"
    "dtWsklpV$7?nIwa{-^C1hu?m3|HEevKmOCf-@iWi`n_ei%MEvq8t$AlTm{`;7m(DxAh}Y6>#JPK_Cp+3m?A2q9^P<NV1Ll#yQ67-r+fMv??LX<=MLU~`rzaL"
    "+JFByhcEnf@vaKuMU$OMlU1_q<$<%PP=ZRDCNYtDdwF0y&IFI+1S_SY*uOW(^8RS2rv}}Le#Zbv$G-bgk8y{u{B8EZf6spZzh>WX+-PUsXmbZa+xN9`l&5hl"
    "c|zhspTep=U4f-k5h*f>bBQBpx=?~v<7)^+jqeI`pzXWhoT4PB3BfX>MVz)bhm`RoODT_0EcHSByWpY}-*h;*m5-;n|C#&hw};>V`taNT-GBMR8q>0&&T>Ol"
    "mZCMwERG^cqc}}TmZgHXW=WNZwGkBBpou<R{Vi-K@Arm!My>{G+Dj*J4tDsD|Czn;mwVqov;X?12QU5n-uEBq*@bChi}pLm?XUJQ>M*9INy4IXJSr$oqNFwL"
    "LgZ1(w16aOs`Ok1oOZu=V`mE0MKlthefPoa*<YI7MV<TnldSAD9Hz_(r(8zmtOMZ;MXlM3l*X(mR361r$i&|#cJ7Y!W!&4%yITCqwNJG-9gZg6R&n^nvs&CV"
    "<k_<?9K83(!;gMH`{nBu)W;2X77ce!8?I1h?I+S%%DIv%j*!ffg0-J%5D}9sL0k`@lobGOVNmY(Zspy{bT5Mjeel|Q`%gW6@cwHDfB9l9?(!3Kjz2+_IBM@3"
    "g`PjhnJg5g0wdCX>4K<~Dx^53JkODYCq5}J<;5L0Fy8xbeRcTJ&-efF(pu6>Emt|WU$0R5v=&$}nnhHwsQpNZiz3sfHi;1D1;PGHZsj8arPl4J@#rp8=W*|w"
    "7xmxlfBv@avuD3~K`Y+D?>;fRkfXLc^R`#^AMNcqDx?%yk(Nr4BHn&(qLsVQLo>sfQgNJ8V9IcvM<eJ}T}T!8n*PIKL4#9LL<x-u#xYjy&ugT89CI8O+G%p8"
    "Ffehb&SS-iUGGAwq*wMItTpE}LwUK>nI)0Jh$jx~of2mm)1ADYV$y<nbKV^ehP!vCJLQWy?2~0r?{4~~zutfQnb|9Em5&R&_?OzWyWVQ&wACu&_KHVX%FFXO"
    "QHn(gkK1?ADIrMr8hMsep5^|C2fcjyvq`#>E2veC&%U|;{PTJsy!X{t2XDW2@Y>&&*)BELyq>|^8=XvZrD^1nql}3(Zx1z*5sLF95+aM@ECGc&&Q-btwxqEH"
    "clPxc_rCe3IZatcJa2r}6ot1}IfPY01SwRMQNo48EfGB#k9C%!B-Wh;N<mQvfV>{>DzNR{tq`d`b7P5Om8n>??--&a;#{PPrBddI_>XbJd7rm8=uPi-i*cU+"
    "Ecafkf9I=v-~4X&+}8(R|7Mx!QcInama0J8Yg&P{UGV}Hy1OJ1c36TVw4g;q^GwP(F8miVM#IUZm-PB2&|Nhh_wM-Lf&TRH7vJtb_0hpMuOEC}StD9%taH*>"
    "m1%ns<B|~>=NQR2RnnoO<rzj1OS2q_gvQ$Be3|~oo*GQ|b{8X;xA5M7{*~Fszb-HNuPP_#Q7fI3R;nN!Obew7#Z+cVRz!K){uW)%7>`g=BxxRT7W;Rj<NQ`W"
    "p5)zfYFhM%w*l_U?f>KH`%gW0`0f8LqdaP-v(!!%X8Q%=l&6#xED?ev0->yZ*QrS9t&}8ONF@AkXOxd#X89z|2bn%`0B2;gci%t!^|!M>{NMX;{(aR%OgG*+"
    "ZG6p4jJMZUBnl)H(W5uRjPUj|u_VnD$y6rOLU*eqg+@J6<7rRN6M&W)mU){i3^me6ZLeBt5bed5<r$Jn<yn>_BzIU4R*X<udM(pax=1F_xS?jgRnGMZZ;kV+"
    "8Lx0ynN%!}WR^v_o;RSpJ>WR!8AAG+C<>m5$p3tv=KWl&WglWK^80rV{`}JHKfgYB{f%Xu)h4P4+j|yQJfci#P0~}^B5yyG$wF|fa)mLXTtx{0!f?+>eNjG("
    "W-J)kKN%&M!`*t36T%DKWyVU+Q`=9uIAb!Q9H}BFD)JxR<_qUpuRkxV17Ldpjn5CC`}5&1D$kY7*T|O|sbb{q=L1QR;Ubq5=OV|f{j<Gk&QT#XOTr3m84?EL"
    "<YsRKgz(G1*Ia9k@Th?*zV?zO2+3oLsZzSH)Z<Zme6f&etPssHmYEO$_@-)J)agGj{rhLLcmK5i;vWuv{alrwZlQD3LiMr!_G390BA0~Xl;nB_gd83gQyET^"
    "JTHnAi9E^t0hUkA_H-vzRu@ipyvOjj|9kfAFAu+e?cmvuDin{K=^QsxMcIC>1e3gwtiVNqWz3TH78;QPGnC+%7lqRQ=Z<osf0vej{(!ozZsv;z8?|ir^46<R"
    "Cx==Z!9V)t{pbG6RQ!{+I;U+dL#6GRCNklvOoik;)kAUn<q{>hDp*S6m~oWG1cYgFcQWbbcSd>Ea~W$IknVr^*ZqIKsMTop-P0AMWmBC>Q_Dmh?h{JE(>RMF"
    "jzuJrqWxk?p6Je&WKk@r613nTM8`LV-ASqN+Mw?O@H}}=fA-3k2fuq}@nBf}A^jgrI;SmGu(n@=q6sQefg?eQB6&g`7W)O(Ga`%_&k{x?7}ndv@y$uM*Xw~|"
    "{qm1m;xAsjSZCUqH`iG-S7F*-F(qRerXo$ETqZbkxPg+TnasJ8l;Jpox%i9Tcrxuyhr2n%W&h4o<r6Ua1bz0;_x|;#$^(mKJDsC;Dj?fSCe4b1L>Vh@fwBZS"
    "6g?plXH;>FB92g;Lx7xX%utPc`U+GKEa$p(`10@daBt|+Qacrv?Tr)jJS$R?kVwUP?vgp2lyQs{Be}|mwyqR{<z#PstE{KIF|S$e4~HX&VgB1sv^?$q_2&n#"
    "y;oiLIBKk;8|xf3woKLGUa3aOq>wQZQb|S}R`6t5hlcY^GJUQ}kTX<ecgxD(bhta}=RgDf;q!l=z4QD1Up_Va<UbF-`J`G#S~l0IG*`juu#l7!q^IXR*HcT3"
    "Ic`5aqD3lE%89m8ndLDI*5gXu`Al=z-z$TK5Yt7O?qc3K`}AK2AHUvQraPa2F11@ND&-FAb)?8MP6XzXYSnbOZ;})!%_5d0L`6~nV=iZ;$vD>z*?#$MHRgGL"
    "JA3b6hd=+@3e4p^b*bGd=Js80j&Pi)h+#<*juV&i1*JzalF5u^3C0A>vC1=QUUNFh)4g$T3azk54{v_*%X{CyYZ%vY<DI3(tCddeI}RBWhVnEkB+b)QwXem="
    "Q=~*1t5_kVXpupnUX;y^hPstr3ejI2SC)Ri|F^GaAOFcL(OYV(O0<0+!Ewr29;G~&5lUSq2yvlUhJ-*l;Y<)Xq7&8YgVDVAua{>3e6FF|anVQ>qr-w<lF%s5"
    "%UymVS}J|(VgyMs7YQXOD{uHI2#kw@t?novj>@ep9G?bkKzdRtRzC9c*{h2hXtPwTbJX$=Ry`6(+Z!3maFlV$ctJ%Rk@h`+_P96}xl~0V2%#w)XjSgUGU^X^"
    "%X*jYIA1KrPat{E{_y&}ul_K5_U{LO|GKd>@ALz7mOnt1di#Di5j-bxxx+-k6y^@MR#l#$gvDA$QbltGO1(F@Rj!xZfaiVq*)R6r`(q<%qtPnk_G^me69T#u"
    "PBO|e%pA5;VR4jD%3{SZ6O@3AZTX#PZ;&oFgw#Q3Vaf+7ghuRt@xuML{xEy`i-Tvr*ng_B1b*6Pr`l$faQlUuEMbwPgs6g2J!xovZ!n2d6-Oy4A|`2u6foh@"
    "csL!V!#<Eh%>Mey?B!PuKlx+@+~ww~XdRYvFv<nVS)p<nQ|T~KF7Ia(gi?_RMstvfaxcxb=Bu0e_yjEg*@O2#pFQ{4;YZIL{JB<WaNJsFskQ1O@Z90qx2T{|"
    "d6NL=5ti+H-lWJfneqaojM6j$Sr_jOrg^{LE3eDEt9!tmd|WQ_%*hgnllK?T?!WlQ{nx&@|8_;$mfP)|wEKVl&q>2o+QQ{tSyrGVqI#O3GU7lxNwg2AOz7iK"
    "g+Z3fcZa>P>UD>se5|1E>%97xd*8fx_>b3T&%U((&db$uj<U7Ra%)wp?W?32PjQ;33}=i}g4@e+k}-s6s!~BBRB({xp5td>^|d;>+Xtb#cp!H6*T3F><IhbG"
    "#4a^eeYCKBx4@Xbo{J*WJuc3$!<GpJD(kxtMrj@kQGg6(lc}2YCgobM!_&phW7z)J|9$w$SCwVnc_W>ZMye#+pPZ6LC?mO^e@Ph=+5S-tUdTl1_ZE4g9XZNi"
    "7S0FV$xbit11*g$o)x_R=HK>T{6qa&!R2<U&%HR*)M^1h3Z+O0qHy7`B_N|25i&tpBvXYzRvb^Ba8vn>9+X?X^5*QT=W8@i9&9^qsEV`w-CIoc|B9rLO3%7n"
    "9^J^|EJ?IM=%GK!Ih8Os$bgr}S1pXMUk?`!<4}>4A}=DslUzikXn(1fTM8DE#x#l*R|Oc(+rzy<26bva`^&@M|NP*M-x@4WTB(9;|6sd_W2}(m7{wXGk#Z<~"
    "jYyi{L`916gb1)3w_WXqdAa<uo9_Y*Li76x_n&^_-Z$?be)8Gu`-X?!jvDQpG+KRT3pvbGd4>yyC{C5&qWvQVlp~TMM)XuQEfNK?Dto+pIq+oa{#(B`CsW65"
    "t(;29_Kz5`nCsp&OK6dzf+g*ry~c!T0gaM`Bza0H$XUDB*Oz9w+thTdvib9HfIaKM*Dvh<_tS@;|8xJ%-|WBsul)~RSY~|Obmyq))qSmW*waghB*8h$u^xgL"
    "Z9jBLqUQ`WN3j%fmga3MG;ic;eDwV)=}!@ntG^&;v162hbNS`tFK?J{KKW#Cv@@*iWqtmKM-8}C43;1Cc&<PHp#S#Mkz0&00*LYI?y#TDr`4Uu^oOs986(Gf"
    "zFL?uau1ULgn71nfKi*;Pt-Ks$;U=IW8yeTtH(*)<75DFKB5n&2dAuaKA%kY%rKc_MPWTm<{qX1Oy|{+KDZI2aGWOAgB0#T!gW7CRJY38>PC>UW5HrQNay}X"
    "&!Yi?yl^K~xAdTt)dE}`-K9jZ8lXOodw^g)Pv_CzU^v~;lf^qmoW!wGuO26HkCTDLd967{=D5~SkCC~@2-fX%9_x+A!?6*ga4Z+B$0*!mgy?l18Sag5^h*_g"
    "JWp@-O($41<FeFIkJP>EK@eTfWu-lMc&GF5o<43pNQ4}V6Kg>t_wEM~z#y-tYB0!+vlbD@;=y{D?!6C!=zSj2L&!uG#<_}^V|8CWKKGsnLG(OV=UXtJpRYDv"
    "R)gWFf7b|AI4+shLv`<fPz)EUnyS&xSfx`V&e(B9s~)F&_k%%ZUZY-_&8zd}_<E2SITlscg2e9K4~FP|uBe|4$I0;anG1J@$E)PkK#Ak>Sv^qq4hTbZKv(w$"
    "owIlHGv$AqW+jVOTxvV(fx7oZSO5ijes4O>$MaYp>`hW5RN=UKR}a;_C&Dq{6*^LxGGdG!7tQK1y7xi^LG`xNy~$1E$|PnN<YYj^y$d1)DvOyuP4~<Y&CbWk"
    "eu#VLLm)bzYr2ijJd;UZWrhS1v+Hq^AmZNj5I6~XOigYY5t==Yllu_&9*02mI9Kvi^-Cwn`+Xxuv&V7r9^&5PPz0#z#t3PCcX{mOJk-6zp%5L;qr>uHs^)1W"
    "HF})bNq4Awk3%7PoJ)i0$^O5OE#6*_)aZ0#C*Ps&oeqWQbS{@SB&T;rdFS}6r#lbkw|eHX2sQek*vWdRdmlt4#9&fBI&f|{oJ<=oQE9~JWIa?m$H*ceiEX?-"
    "neiR9v6J+$$UQ&|5a7dom6p5hJ*1Lx&k*!^6V)i4yoX`;C@IjXIxjiAdUr4{@9O=`JZI-ERfBc1A4c7S<v=TW{eIr>oYk?K>(BExs$n`Q5aaG)LUcbDQ=QT~"
    "Ju^PD>v7T_=HB)22xdBRQ}?fn$^m0W!t4DHj+`8byZ1jFgNW=6Jz7r6vXiqn7CZe_<HSasP9DVFdmv81?$PRVw)3O;{k_4^Oer-&brK=&-v4k8b73a^p^o<K"
    "(H9d`qvS@EPWHpyyB`kG{ahaQdy}0!o9DE7ZI(+TR3{1I?mdx!=!q`g7|b{GYF@7tW>4f~Lc+Z#5)eJnBfTuk2S-nFoq0s<?&jm})!ReU{e;;kIa!f#?~?>b"
    "pQOf#K7r4bOF?Ijez>Y`8{wM$l9Lw+_kKx0^h;OM`DVSHhxM^L<!nvQ)r?rp-pNUhgnREK1jx;KefIX!&V|7Zt-VH+!idsIk%apUR6z8>XUkH*;Y6E5Z>px|"
    "SR;%M7&%Fj@aTXcR{MUWZt5s6?vDD(G$aulK{^?da9{3|5Tnf5a>uj0r#cr0*<NZ+&!jQVASXSN?&FMvSk`>B+;@G_G_FWwMChbO(tTZ1LX4yr#^d=$6Bh@Q"
    "Ua1b|g(-~@6gioZbRR(_$TNH6v@_3V=i1JAc)Q`GB}Sl5awOfCaV3RW2U~ni@56foBSymykdqEccR!F2OV#J{ey{vmmCh6SWV+ih7nRHi)JcS-`%1OsFe}xG"
    "I{H$hb4~XFrC~wH$%3T21xb+mfIB+4rgDYF;j0lk8IW{0ASuBjY@BFILw>N6{785Ci6f8)zkB_B(s@|VPwFAYh7w>W^@-h;0H(HPp2g-x1f#G9V<+u#FRY<4"
    "gcMvFt8{qVxLF+=CV-usCw4c17-E2YD4*{-vMPzj5Q&|9Cw3nqV-9p5<p+AcH69O*WrElkG_aHE#O{Me4AG@tNOy*v3u@Z1=pLJ0s*~x&&Rr^tA`sKrnHTeQ"
    "9@0~;dX$SMs!_UVjy{filpxcPyLo3=%r|{Ls^&8yH9H^a6e)I(6!6)7BRpgBfn%reh<kVxEIh-<7YDDzM<S>AsC#@Mj|AVmTPWi>E@l)%VS=2(WA5Q`5P=&e"
    "!$Gs9E?TGtiJgMv?m<ex@qcCg-lCamq{Jyw_rU{2a1T45+e>fu%V)b6KmKHA{{2{$h><an5Etvw$8nDsLq6WEk9{0(!=!T2ST$be6tDYmf*|_a2Nz!wsgwI)"
    "erwpjWe%Lk?0LCUr0zX0k}%6!^RIR{;xn&RCj~+t*DAz~gA0S+ja^k*(6#dG!;0Z}_jvEVYP`lh1mYw@?xj);q*UsW;dqiyZtnHV;<vqiHa0^w3Z^h|k|Otl"
    "DF#w7b>Vcs*2XOym{Bl=sgoVK7fdmbf~nIdXPR!tGoxGzQzuJuFPCB<<x&^*@%AR2M~8;y8dXx5Iw_KSl@!AgEW#g5IuA9-E;f2x>SRaQy~hP91$$8Cnd&dX"
    "oZm4q0yVl?>Lf+(^<a!ZXy8M8Wuu+*<GZ72Zpbb%)Q>u;5OG&OkgB({)AE*kt_Gb;leE|GH#}v)jQTfBon*+p{*4g`&Aq%c%m=+YO}khv8mPwTBt*nrZ9!`M"
    "&g=INM`b=AQG={`hYm)}k<-bB+^hW<f$;c;wew}gd|vtkGoyyWQzs81?g|f5(l{@H+ncC<zH5YNr~z{_Aop@cMmWe*1~-Q3qMz-Y?T>bp5vZ|<!kiq4xG$oB"
    ")NL*YdM=-uaT+GXoJ`2QdXo_e9OuJoch?Nmup#DTL&V*NK+05~=uPy;GNLmSh&d^cdx0vW5zvF~&E*-3<5xp;@*nE%KNQ3Xdh-V?SFdVPLkyUc{7`o>pdb%8"
    "jmqzgD63Q(m#L{SS~4g9q3)w41-XH{lMinU2R&t;vE~@!Bt6u6451IGUNU+hQ#<OW>Z;!9zq-9{RNXX?E{A*e;<?M!NFO}=$k`vA?VRbHy|^?LTfBJoV&`IK"
    "ak!I!7r(lG_Tu%6*CTTS!N&V6<%c~pnw(j@_e|{&^Po?5uwDPR*Uz0j|05tu7?u)VP01()ZM;#lHgep85{9HiU@4K+l#H_d#+y8ABPT5=5lBiDmJ(e}$*8n#"
    "yfL&ka@v9tg`~t_DY4a*jExZ*ZzrvdoVB3DASrQJN_;gXZuMoSYa{0^C~+`K(1YB%QLcHI6RkkC8s}gKI_QyZ-B8y&*2&hWa2r$@6cqtRMb@A)2fVm7D$)iO"
    "0YycDQPDN1sMXipu8*F!K}A7PF<?||4Ju~!-L&hYXKhe1P*fZk6<>pjTYbgs`sjHZRDdHO_z<{u3~U?(X*)k}ISK*~gW%)f+JUffB&4)GFWib3hUG<|d69Lz"
    "h}G8-Zy-Qg@glIiC^Rp+ju*B1j^PaiXe(Y6mKTHO#n$mM2S(AJ7i-0f!SdqJy!bj^=IAKf^Wv>|`HYV`?rCq3*M98YaUCbGEDm76yK?Er*DgMOq4VU5@$%^R"
    "*Pm=0GVKk&avU3ql{a{REGy5|{EO7;FSx_JdVB~2=hcf3KYsSwkFTr-dh!>|NSXaipmro1sI|9vV4aRtZ+iMecj(IUT6rLY<FzZDODh0gyK?<fBRTtt!SNw%"
    "kRAW66RUi;m;JOi7|grBr61bg*SPT5#Rq?Q@$tv&UEs;<jdwSWf4lMq2U{z>$8SGl9%u!+HSd52h(iFxYXKS-%%~ec+!`Q;2S`EyBx?a0TFjUmK++l@fd@!K"
    "0HkXH8lKF!8$j9`AcY6WLI7lI0UF}Wgd0HC8X$uQ$U^|+YXKT2&7>PZ-WnhW1{h`--Y^a~55%zpLx+(##84b&EZ#5}H;%?Ua-@jcQ^Wx%k{}exdWz;3*&;`Z"
    "q&-CvfFcb-k*=p`jLRH5Ql#xE(f|}$5Q=O)Mf2N+i6ceUo+1lCkq4p3*Hh$H-!yK6gtw;%K1K%`q&JPyjl(o|nXNdD(?JI6KqK|0p}Kjj=B_BQ14<kMB?*I)"
    "Y(Pn@zLMPv3vob6LZGB!P|^)3snr+1TVbINC}{|kEDTDv0VT8gdU-1>%mF0}fs%(o$v2?nR$pXqg@rqy^c=x!KX|Qm&wpotJa>8BTKBoj&1>DF?X>3jK=ufa"
    "-vJL0hX9Dz0yIW!f!zS&)&Ma)KoSBVSqsqorgY*4khBI!-~rMQ0O?wQ#^@}l8$j9`AcY6WLI7lI0h-@s&)fjA)&LniKpp}hUklJ2iMbm<-WnkEC>&-O-Y^a~"
    "55&TOp~FZVVkizX7H=4gn@3~mND;TEhyze0K`4^-6wM(ycBDw!QzQW>(jXM+dWy!lEF(vXv^_-{fFcV*k*%j_e#bg;q{!M+WC1AhAQbs}ipB^nu_Hy^o+9`d"
    "9cYl=G)gxP)6!+O;xtYN8K?t|)SHIt#<5ybSCrTRB@Tg-gh5F*pfm<-$y`wq2b3fPN*V?w-GI^@wYe)w>VT4lK*_?OWE)VLL$`26$sAC!5GZ*Vlzan9bNrUB"
    "D7gbl&k_8jOr!ov`{IHnq-L?k$uC#eYn;Tkwq!%Lo$uHbZfts+ALFG84)ZlH&P{b3C%;}-%5f6rhH8$u?YzjYrepIPJ&BL<w5R$@uiWlUcD!!nTwNTp3G`1c"
    "UVUWU{hadm&3AO-wpw+1D0{M}?+F7nDAkQvo4GP4u1;V>k`0S?Guvjk+zqZ9-GF#+g{1q$Cb&;DvK3BjpKw9@gg@D%BD$rYz53XCDc#Ahu3cHzzh1ktqIYe("
    "9CdskP#(8J0eNCQk>>LYJ0NL!cAdNh{M;G_LV0N|$;M*Mn6w9ZsWnIE!c7fLP12#(OVz9V(E9q+pXTh<^Ov+mR-XzweZ8r0^W?Xy3O8A_&MZ&fe#SgdGr)E4"
    "fCq>}0K{tnVgn#@1BhD##P9$~2!LcQKw<#IZU9MZfCL^O4FQm@1xO8m#0?;A4UobEWFY{uwE&p`kh%e6tpPH4fII|1z7`-i05Ug#yfr`$3^2?vykQ(}9*DUE"
    "Lx+(##84b&EZ#5}H;=}`ks@wS5eJ}1f>0#uDVjsFbfieyQzQW>(jXM+dWz<_96M5^?J3d#6j>08Y&}I|a7K|MMb@4o3qX+vp~%-$G)8EI94Yel6v4;nK!fzA"
    "QMz%MMlQ1zr*S&SKpkkL-ZWG<j@5{`qQnj;aR`(o3`(*Ar7>V5>WY#$pd=ws(l99L29(CAjhHJ+>VT4lK*_?OWE)VLLpOIt$sAC!5GZ*Vlzan9bNm*rD7gbl"
    "&k?-#gV$R3@>4;luQwHLp2o4FaFe07)0*{#o9o^I4-kg{h}Qx%N9@=QAZ`s1!viEC0Ft!;jd2=BZU9MZfCL^O4FQm@1!#=U7`XwYtpQSafGh++wici<CS&Xd"
    "khKQL-~sXw0Qp*g#z>5b8$jL~AoM64W*FWu4mS?Om^v_Y7>Pp+#bL(c4TEvxXpEU7Mckeu4nUCvp-9$KG>2sFNRhOsNCHr#K`7Go6wPs2I8vnTDbfHGSrCeB"
    "Jw<bHmW~uzdx|UoMIMAAUr*5-p<_piygfzmF*?v7y=jzg9HxoOY{hAu4l+;&8mTu8)s15{L9QsV14<kMB?*I)Y(QxY*aW+xBn~J^2$VDoO1c51F=`Xyijq2@"
    "q#;nUFeupul*Z6as4Gh5fRcqk$-|)J8&DeKH({<QxdTei5&XDt(|DzILE$n|qj2-|mn#c5Ph(qGxXDP{`Hn^5=Ek@AF+MHaY<SI!b3@_g>95xmZk~p@zHpO~"
    "w(}yZ!cB`edJ;b>)mnOGsyR*kVApH4mQY{QAN}fD&hx)m0lDq8Y58C+2rs?M5AUL;X8C8Ydt|kmn$ur3)oY!`v!Y&$k+$<E$9k>xJc0q)K%@}~jU14;Fq!V?"
    "0a+z^zo!P>{@y^Pcgs7|%`dk;X|6q@2fnlCE<Aei?BmxT{qf^x&;NVvUbX&<&hcM#j{c&lu&CikD@%;lZd%iDpfl?Z-h8>XJ&Mca+degTTdBd8sWGOdYd67Z"
    "2^E8+25%=dWLv2rmZ>qOxobDoX$h5pq=sxKHFR64p_ZvJrp;?N>1hd-f~1CSCpBzasbQ9>F{a^bH~nb|m4T#&Z6`H+TdCoesWGPYYj+H436+DShHoJ?+fy`a"
    "M{AU{wL1*8;R<AF+tRe{d78DTHJaMmO*Gnq#W4B7TgngFT7HOaehgh(yQ4>2ummPQWJ~#>Tgwl%&5z-1Yc~pM3zov<hi)l9Y-{;pw)ru{EvA6^VKDh&TgngL"
    "T7I}~ehhny8DM@mOn$cFZ(9^NdxL9MIH(l^Fo)Zk#BI^y>@}|0;{;@qFi?{4wvt4)mn34HBva-jWReI_lE}7_M7NhDYMmt0=wiquQJ^HzZ6%3qFG<WgNp-E`"
    "Q3RPJ29zYWtt9d7C5c-ni5p2mkV)b|NdmLGl`jL`KV5$QsVPNG#i~t_uP9sP5yaBM`cl@mN7+tl@U~KeEmMPy)DXDTV35?{?WBfmD>cM2HN;2_g-Z<qNe$Uf"
    "YUs97LoHK7jnpu>)KHMr(Cws#Z7Vg*GBu{Jak$hlkkqj4q=s)RHQX{arlkqE)Nqj0Y{SsDr)buW)+}ifC_6xwwk=KDo~K!hTC=Iefce2N`N3Pt57}CNh;4oh"
    "T|*IIeh5r{$d>X$x0WAjn;*m35CY5(g~<=yQhwOh^22QNV~88VfcarC`C(hi58qmTxNUw6dqV^;KO81MTk*Fo3Y@*cH7Xo}S}_1~xUEUt7A?+R;~G5<F~}rg"
    "pd{gKC5db=NyIuyrp$53BoUw_k!>Z3ZZApHI!UI{3CJW-pd`_4C5de>Nz6J)rq)TwBr%{Qv27)ZZ!byQI!UJ6#gIwjKuH3#yW=em*8Hw@U3hb{jBO8^GPZI9"
    "geDs6wnE?-V$H!~djzLLL1piB^Mtj(1<GK<h6+tNT(h-86PWdzEN~35Het2#g5$xUa=ECJZ~hI`QhBX*zA1Z+RrF05R@KvU46#}PS!2JR?450rebSa}^R+;L"
    "$UeCZvbTC$J!_x1Xno#3v0{+`Qy9KaTx@&p?kWwq*Uu*ptOGWC=d;<{-|fHq{p{U0s^DtBIU=?Axemn)9E+yGQh%m1y<K%9pPWf)xBPTvHoNm*|J!J=)Pt`0"
    "%ksDLKWvQv!y~{|1lT};Y!P5<1lR)sfk!~92#A3I+ae&=2#5y)3XgzR5l{mGu|+_w5l{~V3?2ciB47prYKwqbBVZl~I6MMgMZgUN%oYK+M!-D~2zUgdia;0$"
    "xGe%<jX-!Hknjj(6@fGm2wMcw8iDjc5W^#gs|aEPfwV;sTO)|w5ugYh!TgY?2<AUl5yX}VP-Kfh|D`(ucsoQ@J4A*ZN?SWb)^><I>=41*A*$LTGVD;=+99&G"
    "L*!wH2;L4+)eezihtk##k+mHn4?9Hgc8IEWhzvWFwswfD?GSm`A%eF<RJB87*rBwwLu74-$iog1yd9#d9U{XHrL7$zYdb_9c8K8Z5LN9E8Fnab?GRbpA@Z<8"
    "1aF6^YKO?MLuqS=$l4B(haDn#J497GM1~zoTRTM7c8EOe5X0LcuG%3s>`>a;A-1+d>|uu(-VSlq4zXc}v8^3qYdgdqc8KBa5LfLG8+I7m+99^KL+oLP7~T$X"
    ")ef;?hq0|4Vrx6Z9(IV~?GRV(5F2(F+u9+vwnOY;hZx=tan%m7VTZA;9b#)c#2$8t;q4Gt?GPJw7~9$*wzfm;VTTyr4sq2Ev0;a?tsP=(JH#G#h~e!JSM3lR"
    "b{N~*A-1+d>|uu(-VSlq4zXc}v8^3qYdgdqc1YmukW}rE7<L%j+99#FL*ikF1l|rw)ecGB4oPHdhs4?riH98$csnFjJ0#dZU~7lO+75|_9TIpuBvm^k#6Vzc"
    "hs4?riH98$csnFjJ0#RVU~7lO+75|_9TIpuBvm^k%s^mkhs4?riH98$csnFjJ0#pdU~7lO+75|_9TIpuBvm^k!a!hahs4?riH98$csnFjJ0#LTU~7lO+75|_"
    "9TIpuBvm^kv4OzW4vDoL5)V71@ODV6c1R-wfvp`<YdfSKc1YpvkXG%G8g__m?T}jAA@#6B3U7zBYKPRYLu6}*)Y=ZIhaFOQJET=Rq=p?LTRWuIc1S(!kiy#`"
    "t=b_q>=4=7A+@$c>S2cz-VSNi4yj>>$kq<2wH;CqJEZV-NUL^84Ld}(c1W%5kb2l5g||amwL@yyA+ohYYHf$q!wxCD9nz{DQo|0BtsPQpJER_VNa5{}R_%})"
    "c8F~4kXqXz^{_(*Z-=aEhs>};WNU}a+76kA9Wr=3WK}z4h8<#CJ7m^&$UN+j!P_CL+95OS5Zl@zv$jL#VTTOf4q4R>nPG?6)()Aq9WoC)Wbk&#s&>c>JH)nj"
    "$gJ&<dDtO?w?kI7LuS|^wzWfMZHLUm4jH^1vZ@_2!w#{n9WrY>WFB_N;O&rA?T{IEh;8kVS=%A=utNrKhpcLc%&<djYlqC*4w;7?GI%>=RXb#c9b#KMWY%`b"
    "JnWFe+aa&oAvf$0+u9+wwnOe=haBDxdDRZNVTZ)l4!N}*at}M?@OH?ncE}AoB(`?Qt?iI|*dd3vLteE*ZrCBQwL@-ghup&sIlLY6svUB}4vDQDa%(%}9(Ks#"
    "?T}aPkQ;VLZ0(R++adR`Lk@3;ylRKsutQ>Nhuqo@xrZHccst}(JLHBP5?edu)^^A}?2yCTA+OpYH|&tu+99{LL+)XR9NrFj)egB~hs4$nxwRc~4?7g_b||WL"
    "C=5F!wst72?NE5wp@6qTQME&1*devGLt$-)!ov;)yd8?F9SXw^sjVFfYdaJkb|~QOP*m+u7<Nc)?NC_Tq42On0dI$*YKOwGLuzY>!rBgnhaC!dI}}wr6owsA"
    "TRRlib|^gTP{7-vsM?`0?2y{pp|G|?;bDgY-VR084uxTd)YcA#wH*o%I~4GCD5`cS3_GN@b||dvP<Ys(fVV?YwL@XpA+@zbVQq)P!wx099m=X5O2ZDRtsP2h"
    "JCq)FDB<l;R_#z4cF1h)P+HreY-@-4ol$={R@2^a@Ib1@+2nzkM5|AS{a<}}@cD<cmp`b2Sbq74!qH();y?O%831a$m!u|>d^$O^^ufCG52k}WQy#=KHUtwJ"
    "s>Ozk*m(QckY{WdCN^A)4I8nE_OW5l*a%E)q!t@7Vw3G-Bc8EQnAm77HfqEcw~vi_#>QY`W3|}odW{-y#B7L-dB(<JV&k>gxDgv_9~<|KO~Aw^YOx6;Hrzfo"
    ";TfBRiA~mGlSXW$eQeS*wiqV1xE5P%#75i47W>79V7vs?yu{dT5s~&@f;_zh!FUO(d5N)&A|ma*1bKQ1g7Fem^Acl!L`2$q3G(z31mh*B<|W3)hlsTI66EP6"
    "2*yiL%}b0O4H0SYCCJlD5R8|gnwJ<`6(ZW+OOU6RAQ&$}H7_ytAVjpimmp6sK`>r|YF=V&E{JG*FF~GOf?&J^)x5;mH4xGEUV=Qm1i^R-s(FdA9U!9Zy##rB"
    "35M|!T=NoRpFc#~dkOaR5)9)dxaK9s27ZXP_Y&;sB^bs_aLr4Mo%s-L?<LsNOE8R=;F^~hTkav+-b=8jmtYt#!8I>2_R>SNy_aB5FTpTgf@@x4Y?6mqdoRJB"
    "UV>q~1lPR8*!>Q%_FjTLy#&K}39fmGv8^3q?Y#thdI^T{5?u2VW4}7Y+ItE1^b!o?CAj7##zu6Awf7S2=_LflOGwR2j2-3>Ywsn*(@O}9mynv57+c37*4|5q"
    "r<V{IFCjHAG4_N*ti6{IPcI=bUP5YKVr=$?SbHxao?b#=yoA)e#Ms3RvG!g<JiUa#cnPU_iLpH!;_bbJczOwe@e)$=5@X*r#M^rb@$?b`<0Yi#CB}woh`09="
    ";^`#>#!E=eON^b;5O41##M4U%jF*s_ml#{1A>Q6gh^LoO7%!nUFEREuL%hA0P){$RFkV7yUSe!ohIo4~p`KnsVZ4Oayu{dz4Dt3}LOs2N!gvX-d5N*j7~<`{"
    "gnD`jh4B(v^AcnKFvQz?3H9_63gacT<|W3)U`Vw066)zC6vj(v%}b0OzmRC}CA5W?Os2!}-EKA<?mm!55-V0PoaFR@n67)$@VC$2`|71L2Ty-D`_(gMp!45W"
    "0=+o6tv_DpQg&B=@VlLd^$+=A(z#T0E)I&`pf}a8jfc0VI~5u<GQVqaHH_0pPFQpouayVt_U0d<J6wE(?v2Gq=nf10o5e@y-k5)cqsKYRFXldZoD;f<`E#Jw"
    "U;Vu*M+ilbNqSV>E;DjYjc=&lV6vQw<Cd!5Y~+%Q`H{MPb-Top95v;Hy!l9QWDy+MtD}BC$cE$2wH-C>oXc<MQ)8n4+wbK?9kcoENv@btcXHHjcdFa%CX06U"
    "f6I2AnQu5OTmmp$0<P`koh!pp-np9h`}x>7x6K{-U7=$QCGU=PTiwZ`EoaaThk}Dk;NYI^Jf_j9{-kpySLsfjt+|=2D_hc4-Q7h~-ErBJGg|XV&SYb(sUniG"
    "RH+TmLazn8{PGdl2lM{kM33$Bf%4(88f5w2c*8T&n6{%k|EWAqH#=^v>`!kTwbqjGrlWyTrf`%mtFkXslg<y-c*8^5>uMs_;h^2oQ6t@-Dp#hpgMguAa3~+@"
    "4OG8#PB*&#f$(+p7wZtPZc(<-O?sIl#N{KjBRI{|ox!j_ym9w|L`|pt{DHKmPwH{^cCJRlxh^$RJoxC<{TH7y@GTB<%I@B`Zyo&NfA>HB)9kH3FXLOZ(m8FV"
    "GCOGej?vSPdR&8~N9^A8`hrG=Xi5^q2~AlN=k)pshZB(N4<Jb#a~8*niBz9T`StPx0D#n;#Em?I<$3u1I|qM$X(iP~lPlrM_Hbh?QW<AaAyFohyfs`sKxZjS"
    "vy4j-Gex1`s<9sLV3;1f{o286e`}z5+(s2*+!`Y0BxNFr3mWk#i%DyUS(>SYr%4tUoaS(6=wxp+(y;+u>aTse|H|hL7*AWNfNcC0)%6?_!txl&D34+sN2zQL"
    "5;0x~u5!i&7P1iDAbY!`eB9F=aF&n8y<7TnpPw|j_o+Gi=ex7Fzdii?e`argHhb>v{SQBz{qu!oxW_Gbj$7`Wwp`_mT5}eP<AN74O^Q6qv$!?qlx2Aui$rjS"
    "MN-fJoQHeUqBotwl0N+Xv$H=uzmfEE+f~-MHEWh*o+ye1jT4^5?O97o1ra&V<08%DL<V534J5re>dmRaoz*}8vu3>>^m4;h(4;kJl<NN>GF2%eNYbb^=qTqh"
    "r!o>zB6*G?Z_vYj*42Nz+s%46e97*=@zK3+UcCSIm$Q$a+yBqk_kZ=~GFjbHr);USXsL>lwm)YDAt}w`oG_H>>1Jz`L}09xk_FdiZ;TKe%KT2MZp~Maw?wqk"
    "U==KDuUk@S--@-yqNs>f(i&{e%9&M`sEDUbB?Jy^I@}!%C%tLjo$L%pkZ@;zczO2g7iPbGZuZq1jfhX0?i@8;#mrk{jtD|XiBx3>iIlY$vQz_33K9wZAHj;$"
    "8*}#4-eAxz_6FI`P`BWV_wf7wd+@jKW}m!!_{J;CNaxLTmYb=fY(M+rD2_8mWhS)d=cxVc3t??yRG;tq)K3IS{M~kMJSk67HCil;`hooP+1Y>n*X)B=??3ha"
    ";Zx66?6z#DbJ|Xoq;!}i<cdm>@H~x@Ji)C=3a(G;BG%SMM2ZXlYk!*G9OT_`UM@fYuw4Avz3)HK7krK7yrs@^OI4cf=UgP?Dax_rY0R@IZGT=eo*->x7!@>5"
    "Q|dqG+U;d(lIr-nlirP;X>V}D|0;js@VoC0Ui#$V?N4UUf4vO!q_NIYW0fVVsQvUy6%p2k$%IG?DjZamphWSUDnT=uA&~$wReRInXmS?}>ETDepZ)UnW~8TW"
    "Rf)ErXr)OmSt|AaWrEQ>c9_s65+R-?RNy?}1dwQ78@M+Ay$lZO{^wuc`}Q{n@4t5NmoJ*pmW_6f8?Dl9Keftep7V?raUSWhTD4!iDyLH<j#<Qzh*Zq|hxuHG"
    "Iv?tx`heNXFCP5yzZc`Z*$teux4Ii}m`Ewzt5TdtJmxqp+Dj@E2-Bp{ddfu1SOka_s2f<OYW4)DR9E!`?Wa@)%9);&5~kuL<C3+8nnY=u6#9%8m_>1x144!C"
    "36{C8>I_cluIUWgPpv3YJYuwnB2u6P744m0<Y`)D4D*;JLisy?qRK}Ml;*oPQ0ZN`F5%11_dk8@-Zy_bc>UAa2d|mE!g0f$MZ>H6hW0ZnJ+F!h%Ly$Kt+GtD"
    "U(FH`N|Q8+V^T<j3vbFd#%eMd4~Nt4XgvIBo=&|zcJ|&^v%miQ{s;fkWS6m?wA5K@sS33H{7OZ6k|mi|(L!?l@AihE3Z5Z}3!!9AbAYAT!DQIKl@Ih8o9y*("
    "tMN_miNX7y-}~yL`)~ej_T2}S^}v&sI;SmFfwrG!5k`cjsW?Fe*0avmKouf-*vmPNc@jra><x5BUw-4Bp0h%op!fghO?`sSzW(aq<5$ho^tidzXKDM{7Uhzr"
    "2_ghBSroke+Nwy)8#^geG~){A{vMmD9d%Q|O|`!JZuXlO^q)02*1V;aohWKQ&%!C;y7#0qFBqbzy|*%gq@H6XNXmrE1Vhn;nq(crY*4EO%oSdR+Rv~OrsZFI"
    "k<b%fec88Ps*VJUi?kqIPqSDS`w#o`)l_}$O^4~Q@Bdi9@ha-!N6#Gm`K3ztS+1QfH&kWWUi?`^b&pG=LPbiMYJZi-5z7%tSW!ed<3;Ap@^){s)6Mdtulq6o"
    "#{u@A`F{VMw`Whka`^54)}F5@8|o}KRAosW&P%REsmK||f@P|`D8-qeJQJeGxgaR<UrV`BF7;2xYB1Ry-Wd0ap8u`Y`(HnE|M^#Eue>??_QM*`vbB!UT9s;h"
    "$;X5!LWHI&^of=_Oii;SkMv&(78NO@{^O7ur#rpfJj=D`C#v7?O{U5l>zm(e2R-=f-)G-_Is4`>2S2Zj?@KLqmRhW$ZEyCuzWS4L<{wFIqec6Ul#?h{L=-8?"
    "Vpc#b^!JB*+3_<hU43ch{!g-e^{O_f#gi<DFMM|Y&G#xR{$+#5kF#`+8?1tLxPy{uuUAaZX+@S5Mf;WNBE^x)iJ&-36CNi}qy1<{O(50j-nTCweAJ{)rwvtE"
    "Iy|lxWf4mXA(if{;{>&4sV7KUyF{VKDJ={TPg*Tb(sZ~7dWzor?oYE%-&=W#md&j=LEFo{jB%cG7E47@8l~-ZG}9e&l54lm^&w*Ezl^FTX+9{Q#)k8#gSWn("
    "z5Ki>Q728UHYwcR@Kc`TN(h`XfhkGaPeLQb6H22P>uD&%Nd|P+bevCm69AK1+&0~R@gMsyzEOWtb$;7)si7*%_J$u5mFm+<QCvj0;O$Kc7urXOq6JMcEhO{5"
    "Z>s;IdrS58{~s3Jey{L;ZtCE*_hzqtd+@tw4&Hfh|Ks1^`})h-Q{Pl>pz0<&^CmmPqI1+_l`MCdhvtY2u5F5Nef72{n{lEFk`+ox8VT&bRFaPGj;8sY?&)v5"
    "7xO-S?%@5W4?g+p;_oYG>Y}kurLk&lio>HPth}8h(o`jBOk&=C`H3kNMT`qQ<};l6U-`Sk!EpEPbf<i=m#RM0Q^B*Be|ztrPnFC4pT2888(eR7#Z$tVwil{g"
    "cdJzBiE2!QkfQx*8_^=>G{&s7vMl$1qOz=cTa>(&C2&JMFZb>czW)2c=N}$^{+HRuzn*>ayMtdpw+#2Rz0PTSRjlpZN>BN(X9{DyG%2#Zb#nSv=OUGf{#{!B"
    "xt>zp7<P4^pXIx)FaMLHRA*D4y|(|t3$u^^bpNdnt5c~P!_H|-)jELov(q%oGs?6DWpTy|+J1JL6pWFaNmM>{l@N~`r!|_B?tEAVrTNO2dc0bQK%MFTd+M!8"
    "=eWfxRqk+?U+N3KAc$mokRk0a_askgMrqDdA>%wLAgC^iF}u5Jw5x79JUi7ucJ}-S_rCgS@ikBfU%xqf;fvZsREst{%WYQGzx@*wanAHyUlj@Fd5jY3@Jw39"
    "Qav#xBGFTTECxGcZx74bk_qS;`^V=GzyFtU{hzi}^{MtW3#w3|2tia|$9nK~c-lv5ebBv#`2Tx*x8}%=D^d5a)Op@f)5trZH}<_p-D>S7<@TJ26CDX4L1MF5"
    ";4V~ki;g%EvSrD#<gx6re3fij9?Q20T|AaAl5FeY{F4(+vh{TS!b#LUk*Fe&Sm*~^%>rvB*9Tzbmp~@qC%StBIseD$SPrxNWH=sWNh$$=p8e_L)1Uw5^p!tq"
    "Yc(9zYRLrZFcZa#Fc(4>)c{EuG(Yu~E}}?(F;OZ>Vo4x?7Ef@{ry>l=AD;g6jkE9n{_)>mfAVMJMu~2vH*dwH*!)to@Ffpa6#9aZ$ivM~a>*t2RTyH5l9*GF"
    "!*VtrRnb%v`=QL!2;yX)^+)HQzj^lO?-tik-+Rd(o6Z~UEgLlfJ6x5Hu}8fqqB2B8_{{-(x{7idqA(FM@g;@;T+CW7CZD9khbkYZ`_m;1Imki#tFs?{^yK50"
    "&)$819qzorp4Fg<x4G|!9;2~G1Pz3jprHBGDPNm@ppftDaVqizhrpXp^07>ZG90LWrVk_#19<bJv+sQU{PPdaKmX$F6Jy2dT64Wcb0$}Zi>caCz2cY^+K?jL"
    "e8!Y7k>W%N-Q#geeW1=i(j%IK>BS>`G=bEFmtH=7^Vg@}ef9Ls|JGxG(+~erzMWEP&;;vnK{Zs0$%G|J_u{(eX@13u#E2`2{V2eCT*Uwj?u*euv4$M1)IR>~"
    "*JnTZK}C^WHDur<%`c`h5{G^gBdm%WDT(KR69>BI<DS+t9=ExqvQ}OPlW`Um&oYbpae6$+j${NeT0Q;fJ5T=jhtpsGNP{)1>#DupdV40^=2uq{Cz8YgFO)U("
    "<K|1HxQMh}D4HO`MC1!-xVpjNI0qwp{_Rgs|N8zWvdhLytj&i4dL%&nAYz^`Xoy+!O99$hsjp=VOJ7Aqf%I9+g}?Ksk3m44F8H;Jz;dbYswoqx!|W7POiZC+"
    "T-;v{apW*9ohRA>JVZk#FicflBGpbgmeCjt>65R&b^iG~l}J}jnMj+D3<8d#Na`-i51HcJVXkBnicrR~Sm&Y`3L%ij>BDrW`mvG&h|~W3{a>8E^Plz+I%}r4"
    "XvRd@d<@{r5OY@COo^CJaP#Z_36%*aB+^GXPZA6=2FT?wF1+TbKa>yWMh-Co`0t;d{p^z`ul?c4d*3l6b<teUXwF3IFf)bwjOh^)36jW5sA#?{jYnK!PZe(-"
    "Ly1tZXmgnk9Hvoh<9hbzzgBZywPiwWKB&@FP$p5JOQI(t;qa)HKn0QS>;6gVZb}c!AfPUuL^>YnE(3<?>HF`W{`0R-{`~fn5B0F>Wn=yM{OPW1t(jCECZAKk"
    "nCIhZvPh4vny>d0R8oQUH?c0O9A-#$q(+5{kEf5eD<0AKNakaZ5x~Fy$LV+9J^kUUk3aj&xKO=lu((&P8|*C_H1RecSP6~-PmkbfsAb+Gp@Xb4KUM-uPJ)<Y"
    "5Lpf7u(%rE4csq(@E2WVOGDOqi(BbZhiT~)YqUayL4dF?o7dT5dA}Z@DeQ+H#t{O$88Dk<m1+M0yNb1bA8R({s^I+k@2uMcvl&-L+a_p-Rlzh$m>-ddYgs6k"
    "o;U8$Fo_taDhhR{7?K3$f>xoI#Y1w7%lQ3pq*M%3g1`K)pPYa8+xcCCcRzjdjnb8^S-ZVyyS=q`P0Y>5V4`?tg<yf=#e?Z^^J2_ng%Xdk$d7$pl|k+v9H#lS"
    "R2&V}QE{&XqEwuH|MzEqdF9D>|LgqoKj?ov{`8I0?-}zji$;rTvEHajmpD%sK)&;I0pvqW7s%z{p>6`UJe+;|2WS8O3%exD8{1Y7nh(QhaW;pdxCp~l@lc<}"
    "_YDR2J*G8G=^=6)fn4A!`m%VWG>*8h-E#s$^;f?+{ng9o-~H&zpBwWqie7BqR&UXk3AOovOeq}e4hf+!@g!z0y;&F#FHj<i1ob>HsE@MIVL#3LL-kON`f&zQ"
    "0#5(>{^NhVbN2Dy&VKyMvk!iyDVO;c&Gyo~H*K~zZ`OnyxX&4)?sJA{!y>S+<Y@j{i}-)(?{9t{@ce0iWqj)&FCKV58S2hws1LvEX+F*`?H13a>s^^m5L_pD"
    "^<U>LnvYqoN3QtG7x!MKf4O_o0YK8%qCt9`tKP0YG-4~sz<LI<=agjNoaC0*GS*M>x{~_nA06pGyqu!-en!lZONs=!r$_)&ygV5Vi}e8a57J{RN9%d(96RMm"
    "+;fCDL9eP}p8i<AXzxY)Vco<jL-(_B%X{$}WH`wWRjmIoD?wo;NSzWC?g@gFn<A&)?y)i-TR%<FE;h_5MfYMuA&SlYw5T<@7x`EDPz|PcJ&Zi5U2(Wep47eK"
    "P>70iCDVVY>|IUsXks0&)Gj%~DM|N|Lm^7ePBgufZS{=QE;znZe(nW_1~AT3j0^SA`m7wtJRPO>uC&ifC)1(s=OqJ_fZi23md6L9+08Q}Q)Zo+!bx|S`<clI"
    "q|+UwYG56@%sMrNlkqV3Q<FiQn)g&v>_mO&-Y%ZX(YrQCUreoDg;^)6aB?5!exfo6Gq|bsRpq@K6KQKYv*bWH*$;D<0|rrybO};voaIsR(yKeO@0U}xiji>g"
    "Am(0-I0D?ABYAvW+|29U%(BCBvfQpmPDaGt>k)@IQ*Z143<h%4dw!(U(eb!=;@i&rwHs!__Q~p`M%?{m<q#+9?s$|Qs^W@9@2cG2S9YTI8SA7+-2IH@5NGW3"
    "^Xb0Nr^WuQ8een!gmn@n?ta1wkP~(?)cdh_I~(pF4)p<SX_Bx{Rwqpo?kB6j0EymO%rLr~J+gAd*6TE#1W91`94W+MD@Ss_swWlJ%hP-(Hxkr6K@Kr&8AJ!_"
    "D2=AFJ2=TL)fL=I)Jcm3cTdy@Nc2W=r%(&vQ98D(?6d_lNhdE7zH^ek2a%*6ndQ|zrf<LC*2#x_&pkzms&gY7#A>)9N4x4cX^`(;b$kk!<LrV-@A4!%9N5RK"
    "Z&x5E1@hf1kk3IBNRB63^M=tu#U8b*kCXoR?$yWl0WDrl-8LI%<C9~{fPA|OIT?`eUWEdPDzq~h=?>+x99rX)z%D{g>JzvZp#Z~-Q;r{1SV3SFpukCc0`~$G"
    "P>?Ir`GFpgXu%uWg(t8IPvE3JfqUTzAPUcw>B^%!Do*9tt~`NNc>*Wz3EV4B08x3KFQ!&zN7Z*y0;}Q#PTmu=s5lU#%Uk=yLhE|F^XblJlGea7a5A63d0<IA"
    "52T~iW9NL5mKA*#-AvF$dvqN41R<*GZZ=5c#j`)n4DGtgoifDk8B!=eub4kk@h<K_I3-Bk6XbB_x?7o}T~U3f9JzarAS20iHUhCG7tF$&83s-n`tBJ9aJG7R"
    "{<zrQjmgkTwOmw*=Q*Y7UQ`jp)w<nua9BB*oP{?tbkQ6g$2~&=cZDY(Z%C6^X=0}|iF=w1%;xrrM@SE*Q*Ep73(Xoc^CeFCGWUET?i^emWO965Or0zzD69mj"
    "Q-Z=h!2o#3eCOGJ>D{stwM&qb_8|8Xgds}M)#=-fs%MYRS}>DzG9T<-g)qp7IhA2LNXI9=>jRk%tTeHerj!3*cfrF1Wa42suDV|^i*6?9BtO`_%wmu$19EU!"
    "+=brDW{*BLlcZLXPX2@4Ef!>c_u~4id}Mi#HJh6tC+~5e%}p?fs1LKec!b6CLp3>)_MYTcnojbA-CZ3+^pZQp5~j3wc_3qzS50!7HDhM#<UiQGyTlNqlILVN"
    "i4L-GG8n|!*X$uQ_N_dfya&6FO+c0*Oox`eyNTAj!C0T9_mv!s53Fo0H$YAj<h~w(5Rhv=ksM5C|0p@GxX(Uo#LUylfr$I1ACPqyJHv50eW_067{yw8L6DOK"
    "xi7sSAWJXyve8h+S?`LpZvGH!=><Vf2IRi<f`BZ&xGZz+dHG@QvML6i_P(?`P$v;`Uw}af2g&n59!<uxuEk2y?mnGFh`4v3AgfGv<tWOI59I!2UV}!N)qz?I"
    "P6&1~BKHL+g!mx$yoUQ><<7KvPVD4D#J%SPSy8i`>T_ETBRfm0$HYz^<i4neP>3G$P8#dO)$(>~b(Gjif2ey$39@GBh7MO;e2&KH!;0IM#9A{%u#@<>uNfjB"
    "Ylf_=Ki1_RYvB;VPU_>naEO2`9NJYX&I_U4%e4B8Y{#=!5E1NTKkh4t2o)f6DTi@3k{d5|QM)5?G9c>Skx+<^<l4j81C92J>m(JcY-g>Qi8?6|b?;C>mW17("
    "J_>)F#;SKiPKM)w8e10<sNJnNnUMRMFv1|ZmFJ4*AgE#SteMKG6th;0M2V9IG4~DzWbxa-%Bm5Vwcw2qCkJw0@J2uuycOfj*%OB=2b$K3H$t2w$bH2d5l}Pm"
    "^65g&18FbRoV8)5=_EtK{a6KAYOyy;5A=|_T4;rR$U2#j`!Wjxvdm(7W3zH#VlA>D#L0l%7g-QNz;1wDdojxomF`0_OWuWjS~?k!XmMIX+&sBDeZlE4KC#b8"
    ">&^*rav%5QBt$TfH9_;&4po*{VVNv(5+C7ivLK6QmRVj=`FLXQOzY|oadIB_B{M__u*0=jiy0TM=onUwH-#nb)Jc1UyR-|Kt3QK5b&<7XojRG1`_dpHf^NGJ"
    "OVO#5^oZJu&YqEJc>GK}lKa`Pc)a29K^A6tU#3-`_0zuR8M?sM5$xQ${Jfd{)q6WP?mqY6?)3-H-@JSI?r!f=Z|Bz9VLjd4yL-Ji-@J3HcdIvRVg;rY<H63Y"
    "2e%%~e#v-6UF8hFBE3t;`K5A{OB=(Q&q8bd{RfwKt~}czf80HPT!+6k5x8>NVPk%{C4byCf6_gFQis3wNRY}&k&XG0mi$TA{Au_6X&wI7Jn_oenvMC<mi%eg"
    "{8{(>Ssnh?b0;cik2dDVTJmRI^XJ|3=XLm7YX~YQw>IX-Tk_|f@_!lvRL_8_6bM&NyKRQBwF7l8K~KYi>S<852XT;{fZOf_-1$x*PhlsJT06m(Apx=zNZXx2"
    "I^PNODeMGVYbV%7<b&)4+IA<<&UXTP3Oj+-+6lH61t2?twcQD<^PRw-!cO3|c7o+b$OG94yzNft*p8lx9@X@tN<l*H$H)MN^b{27sW?(iNvgCYgkkmsZoMaP"
    "_j`gojXgo??Fmbj5P{hfr1hR4-R}wdH1-6ow<j!LLKJ3C(AIl`cE2as)7TTN-kz|e2{D*G!CLPL*8QH~Ph(H;dV9h)Cl0eGc<Vg@<4)C|LEKrJ{>rBPaQXQf"
    "ch)XH|Df8M+6|@`VO{sY;`?3m$KCVCb@<z^<U{bsE&1cF`IGMXlREruLkb}Hla~BR*ZgVs{AnHjmKR|Uf<JA^pLWfkb<dyG;cwXxMiBg2Oa82D{=9qsybgcM"
    "fiQ;P&s*~E)_<Oc0M#>~N(I8C^)6`bK;28w)3Bg=8dT{)n1bvC+;%76&UXTN3Oj+++6k5nVFt1jNZXx2I^PNODeMGVYbV%7#6flfZMzd_=R1Ktg`L1^?F3tk"
    "1jtTcZFd6ed?)ayuoHN#onX6>53&<@+nvy{9X%C2s_947g4BMD3}8r4L6M${Bh{3oN=qUh%$~rl_XO^KPmrgvCrG_LVW|>9FnfZu-V>zzJwczwo}l&igyl;F"
    "!|Vy#dQZ^q_XK+ydxF*56P7d)0<$Mr>pj7`-xK_4><M0PPgv$eD9oPVt@i|sJ86#Nbf`9N=)c(Bq3+E>ZP_jN?!K^h>$z*auU_a<^WS{%)heAL?MB%~Y}fr`"
    "1OeGadAdK8#W%NXg4j*Fi(p%J)b6bt&+Y8JaIem;TK?{aoz-qMUW)FzyGmg|cG!3%({a_u5I3y%ir`!J(B8co_pJBsRo}BF?FQ$Iu-yX0PX!>Z1JE8u_z(bb"
    "w*bjg0Z8fqwCz8D07yCn`0(kR!(XX&5`U%YET&#-hF@_wjgM43IaK4>#HsZk8kfC0*RH<s?6o~>qSWg1sx|M+t(z9RQ?{+VEx&%r4piN{Z2N{wN3tCt?gAj*"
    "3J_ZWeK&x(F+dCtkaPi%Yz0UxfPou8(ik9t2S~dBNVftkUz4ERa|1{l1ElZ(Sr-7=R)EX`h};0O#sC>SK;8vFz7-(10Ae?QyfHuy46vJS_=0}8vLoiifuTcB"
    "+(lR1O<#OLXI$AEbLvPDH>Zd@ph!BQNVZe7x@68ADU#+CNe2{ZClu*+igv%u9Vyc06ln((Stk_Pc8YfAEF3Aa<`h{66nQ5U`F4tS5A8cr<jpC9_t717(iip8"
    ")!nqqXvL|Y?xdscsHeWDtFG*;h3ASAJD|i}pd{U(Bp0BxI&6VlQ4$A~qzja^8<g|{lvb}Tuq#UHfRc8Bl68ZUU4YW+x&?7X$sAC!E>QArQ1S~<TK%`6t|++!"
    "%9cHN>4#R=y4R;JtUj+=g}TaP!}3!qnhtBWFF4)y4S0aK3xIelK)c80ZUAv(fEXSi=>j0x3efJSg&RQ97$AWMNV@<?w*s_#XWtDVZ48jY17uwQWLp8+eRALi"
    "kTnL#-~sY30P?K>t)AHT+yL^%0HJ%~Zo1(M`r*os*hdZw9eUy}y5es7;tM+C%HG(=judfoins%cq!Wr{J4LHY_K71!(wrjcfFkXLBHd2W>X&`$NRc+DNIRg&"
    "I-$t6Q?xo~pE*)w%_*`DDDqAy^6eDu9-2E+<jpC9_t717(iip8)!nqqXvL|Y?xdscsHeWDtFG>=eOHv&0VVDNCFuqwxd5fzVF#`#i33W~1xnftN_qiGtJe-Z"
    "SCrHNCG7$w>jove0HxJ+2gnsAb3n<uK*_s7$uB@@_1^(@Madmdw(P+di^Z%@8ZSRuM`|q(TW#F9E^L+Cwgq7{Xgc1hu>|bGueD>mTJ2TwSu4&J>$_H)w=C>h"
    "rMZ1Y7Y&+@i)yXms`15k#Aj<g)_-nw6Q{JeW3{PjW!5UC4NJ0U&~%vOxCrY)9=IbOcq<P}E(7ky14Hv59q}Mrd02)R2sa)Cng{KO2i?lU);!;h2W`k>oQ~yC"
    "*JGKk{j+i5*t@m2^W1~4mTsa?Kh=e}YL(Oc8=KZRiLI{)n1A_FIY@Qo-Spco<#sbJ42=tK!G$ecq&Y6!2p5LMMWAt!Ex3q<i#Eqa8sQ?axF|F(x&;@taIxmN"
    "Xd_${78irY#kSyL7B1c#7i)xz!Q$f3xcC-a+`=WA<Km5QaX?(~UE|iivAT2g8xm{SJ3@Dl@crY~4zjw33>=u@X3Q`!GXl<xY-471lUtv?z6k<p#*6?nqu|Ww"
    "HfB~|x%GMJn;_6;%qTE32F{FaV`g=j7&|ay&6qJ@W*nRu-^R@9H8F8u#+xw%?KeB<IJftlm0c%pYW|J;PVmmNgWhv{_gUG0V&(!4Hw1^F!4Y_HWGgtk6Xh=8"
    "NJDT08XScON4J8rds5*7jy42Gp}{eDaBM3$yF2w=z_Etl7&JHz4~}mIXZNXr3pm~o9AK}SLHDV5xAdrYtNK&YaENfXQEz&;ZC`5qv&CiY_50-uTvZF27JvJO"
    "<xGM!869k2%CzaXVR2z-TzCsEOF9T{jte)!g<)|KXk26qE=x5CX^x9D!bM<lQD|Ir3oc7A2yKpwHo`?=aWQCIYzr<+D+p_ji#5W<U~zG1Tzm^IOC|_!j*B<K"
    "#bI#?Xk20oE@9yk&2foFxC9_Bc$3(w64fr@Hzd|jCZKHsUMIHtM72-^4$N>fW*C?m0cS?GF|(|KdJfD;GiC&s83kuXw=uKSf+7cIv>7uB%#49EW80WnenGJV"
    "GuDh517^m-nelDREXkn6ff;Yci~}<h;LOA}W|nDC>cC7iV+QIP9mvLZ+o;qH+Eo7=`v$mhbYL9Ym7~%*D0cye8-l~o;0Qc8vK5>y9>N72X$X!$gQM`^=vHvH"
    "efTcmXhU!m8XSWM$F_pA6(n#0#~OlT(BL>cIKCB}<sr;-0mmDHYh@yfRbQo_8?QxL0kl?pEhuhW@3qKi+iEYtn~WW5tn}LYl{Q3IYrL#aT2QT6-?iYnWp&pg"
    "x$SGa1aC6NsI{)^f-kk=d#s{V4wgSBDjkm7ke$V|xn93^>$$znOsAWxd9o(Q>ROz7EZ4r!4M*G+N4%Y*<%kSBal}nI;%+#St~iqI94%#J#EBzm%8_)#k#@zA"
    "Zs%wjB%@9oX;Y508;-0ij%+(eODGw0;>enEWZiJ&U2){wIof{7ojCHQ9C<e!MOPffc8=DyFD9Hgil!VzHyr)0IQrW;`W8puiKE|?qu&k3pev5Sc8-C?F>vA-"
    "H02m{!V!5LahwL;%yGKe9M^a*9Ff<MBl6mCoUOQD{nTPUUTL-c0$|m%DHcg=cru0HO_b5`sT7k@KN%<$sbc=-`VWl}ym0Tq_1o93UAb18!}-F!-u&~b)%MG8"
    "ZCr1^_4QH9uV1nQRUbjyzTt8RZ3l?E0Eo8&v_^1S-yF3C2W|`y!viE;03=%hT0^(3FOAxQgER(6-~rMu0Me}htufoy_eE{NK^p_4@BmpC0NGZ6)?jVxd!n}B"
    "V2uGXc!0bMfP5=JYm~P2?ND2A@Wuc+Fu-oQ;S2iV%8q#JYoRs~ap;M==!(1Pi!bPmD|_RuZ-m;01UILMJD^B9p-8q<w7TT2FN4~Kgfyo}I-p29p-8t=wEE?("
    "?}6Hegf^#0JD|uqp~$vVv^r<O94WHq6j=upc_$S4c8Ycn%^fN7<`lvE=#Dz+i+btmZrWwE;?z%f(ouKRQ(x3oSNGMvD@yEu5_f@;bc2#yfYR=;16P#90VU}I"
    "CG7?!y#S@vYx|xnO6q`;c7c+0gOXi<((1Z><cg9xpk!U3<lUg;7ofEIZy&p&<PIo-d+@A_{`>CM-n;Ud1-`?u=5FJj`)>PwyYxe=n+5B$Jy!s$o?)=cV$)L$"
    "{H7zC?N2h;_6>M|xC?-ID?m$meC7raHwK8|0g^5NlC1zO(eb$(K++f>fd@#t07$n2wDm@~0i=xqQh0!@3xI4ZKwD~jH-M}$Kn4$xcL9)Z1!${G;0BO42FQT{"
    "cGC@C&<|I3#DV9)(4i;pqATvEFTS8NuI!Bi<VX=Wr-(bCNIIcNwo|ma<N!NTB+V(34k*%2DAMf|t$sNmjudHginIfYtP_fCJ4LH=4yYqV)|?{ifFkdNBHvEY"
    ">Y)SXNRc<E2;N6`)Jb2|OILT(E~6Eve!7#6x}%=@qOQ8SuNJN-u>(rn1xnHlN^${8yTkTfQ4$A~qzja^8<g|{ly<KjxT2&EC}|fcSvM%z1t`m1x9@qbD47FF"
    ")&)x54N86iN^YS<t|++!%9cI&VtKyxN#h02>qxC7`YWy*7wNBZ+qO*K_nMA(YAn^i@N4ZDuNLfAeAbF{#iIQc=`G9lS7~lvxbJ&S$3?Xk@7MTZJL0n?FY7<I"
    "x`|U-_Oe1;weV$?(uSokzSne^)Oz{L1|GO09(XGcZ1G@jJQ}=|^+*=$p#~~{X4_G4`p(CvZ~yb`=U<%u{KsbYr7iQsXFrz@0DF&<%JuR3Z@QEo$$gbyidet+"
    ">xx6PKi&K<$HTSrX2Wk5Tc^L+7y*VyfK3G0LO|;xz_k(J76=GD0%9T{76Mim0jZ6Ev_L@N5l|BWwGi;S2xx5tv;_hNkARs7n1w*pMZjt!U@Z`Ecm&);z%2xR"
    "T?D)~0^S0FfJY!q1j0fP)I}g_BM>bR`0xmP6G3?~KdD?iU746)8-d>fK>&{+FcAb60#p}4P#Zzuj$q5edRGMIl6rdyJ*j*&SXE-ktBXMYraJ<7J4B`(BFheW"
    "T{}dz?GUxFLj-S!$h1Rb*&(lMhp4t4q84_D;O!8Zc8DxH<aO;3)wV;_!VVF<9U{{Xk!6Rxt{tM<c8FToA%eF<WZEIJ?2y;BLsZ)iQ42dn@OFqyJ4BWp^1612"
    "YTF@dVTTCb4v}ex$g)FT*A7u_J47w)5W(9aGVKsqb|~uFA*yYMsD&LOcsoR<9U{vPMO`~Ywe1kKutN-QhuE}3Y}uixYlpbD9pV;th~e!Jn|6pTI}~;85ZAUt"
    "+`<kqyd7fG4zXp2qOKj{+IEOr*dd0uLu}e1w(L;UwL@In4si=R#PD{AO*_Pv9g4bkh-=#+ZefQQ-VU*8huE@1QP&P}Z9Bv*>=47-AvWz0TXrbw+99rOhq#3u"
    "Vt6~mrX6C-4n<u%#I@}Zx3EJDZ->~lLu}chU)K(CZ9Bv*>=47-AvWz0TXyKzwL@In4si=RB=B}fOgki&9r|_ckkqzA(!vf2yd4tL4vA%leqB2xwe66!utNfG"
    "hs3l)V%ecz*A7W-J0vaakigp^G3}68cIel&LsHugNeeq9@ODT{J0zAJ`gQG))V4#?!VU?%9TL+HiDid=T{|ST?U1yvLjrGy#I!?V*`Z(84oPi0BrWWaz}q1)"
    "?T}b@=-0JFQriwm3p*t6c1TP+B$gcpb?uPUwnNgw4hg&+64MTeWrsmsJ0!L3khHKv3U7zhv_opyVNll&X>B{CE$ooO+aWdWkXm*a)U`ue+YV_9JEZV-NKHGW"
    "mK_Fl?U2^CL)yX)DZCw0(+;U+he2ICq_ypkwy;AAZ->;hLu%P!P}dG=Z9Akb?2y9SAvNugT6P%JwL@Cl4rvQJr0{k~O*^EP9R_vnkk+<C+QJSgyd6^04yk2_"
    "L0vnfwe66$utN%Oht#w~TDC*#)wM%f+YV_9JEZV-NKHGWfrX&19n#u%NL$z;gSSIw+9C5S1a<9@)wV;{!VVd{9Wv7n8L|-6wL@0h4p|F3Wbk&#Ogm)QLQvNZ"
    "S#3LHE$ooN+aWXUkP!<(T{~p8?U1#wLk4e$%(O#BEd+J#kkz(B*1`@Myd5&r4jHo$)U`ua+YVU^J7n;7$V@wA+(J;-4q0tGWG(EF!P_A-?T`rzL0vm!we66#"
    "utNrKhs?A?X4xUCYlp119kLd7$l&denRdu5J4AKukkz(B*1`@syd84W4!LEAsIDFI+IGlW*dd3vLvGq3x9kwrwL@Op4tWbZ<nVULO*`b49iqB+$ZOjnZ()ZV"
    "-VV8GhupG5RM!r9Z9C*G?2yCTAvf)iTXu-*+99uPhrERya(FxBrX6z24pCh@<hAXPx3EJFZ-?BpLvGn2s%wY5wjJ^ocF5uFkehbMEjvVY?U2{DL*Bv;IlLWm"
    "(+;_1hq$gC^4fODTi79ow?l5)A-C)h*R?}l+YWgPI~4GCC`>yPmL1}{b|`Awp=e=;0^SaVX@|nHLtNJmMQuA2E$mRh+o3S+P*`?|>)N5HZHJ<T9SV3m6s8>t"
    "%MNi}I~29;P_(c^0dI%Gv_oOpA+BqOqP8817IrA$?NFF@C@ed~b?s2pwnNdv4h6g&3eygSWrw(~9g5m^C|cN|fVV?o+M%%Q5ZARsQQHnh3p*6>b|_3c6qX&5"
    "x^^gP+o5P-hXURXg=vSvvO`kW4n=J{6fNw~hqpuDv_s#rLsHic{n~cuH?>3c;_)CG$#I$upNZrs&YwXZ@ixOa`|hvKKl#<^zrSaaSpRsAVG(CZVDZ5^162JY"
    "@H|)J{L<Rr)}Q`uI?qefC~fmYK>49^e#pv?IOK=g=7)ju!{z+2l^=D;54X*a0Od!@`4KBW=8zw0n;!+rkCyYJR({+eKiW1w29zHw=f|x4ghPI;ZGIdmKVHs{"
    "Tlx78`SG^-384H$IX_|L7dYf6+UDm2<>#04E1MvyevR=3`T1@03xM(q%J~IWe#jxepk;mt$X`&|U#zDRBHzJZP+NaNK>mWt{$f3H5cv-Ng4+5E0`eDB_804U"
    "g2;F97u42Y5Rkv1vcFgl3q-zyzo54Mf`I%5mHowf5+L#&`~|i37X;)lsO&G+WB!ou;4i4HzaSugL1lljp5cdl2Y*3r{RIK}3o84I^?*L)JNOG~>n{k%Ur^a!"
    "tf%jxz`<WoTYo`7{({Q>Vm(?91rGj#+WHFy@)un87wfrsC~)u>+}2+(kiX!vzgQ2&LxF?8;I{sPf&2xR{l$9X9SR)$1-JDV4CF7k>@U{i>`>s~FSxD0U?6|N"
    "Wq+}rRfhrxf5C121q1mDF8ho1AUYH{_zQ09FBr&QaM@q1r_7<i!C!D&f5AZhg3JD5Jwgrz4*r7M`U?i~7hLui>-lilbMP13)?YA?zu>aJSPy^0o`b*Ow*EqZ"
    "{DqYL#d@+E_8k0$wDlJP<S(S`FV<t*u;<_}q^-XYAb%lcf3cp)hCK&=A#MGI0Qn0k`-}C!HS9U~3u)^w1jt`V*<Y-usbSB-Ur1YjAwd2@%Kl<KDh+!M{zBUN"
    "3jy*MQuY_?IcV5(@E6k7UkH%Dkg~s64>`l0gTIir{z8EKg_QlpdV(274*o*g`U?T_7gF{Y>+xh5Irs}{>n{|@UufB1tY?p5<lrx~t-nwpf1zc6u^udjk%Pa`"
    "w*Eqa{DqeN#d>NOMh^Z$+xiOy@)uh67weH=7&-V0ZR;--$X{sLU##bSVdUU1w5`8TAb+7{f3Y6sg^`25(6;_Uf&7J*{l$7x7e)^LLfiTa1@aeK_803hTo^g{"
    "3vKH!6v$s_*<Y+@Y+>x+FSLQb<l}5~(vP$3=o#htSh9rSP|;@swr!H@4_|rw*&CP6zy8nD?|#$Hb-LBa_15r_{`-1&;}iXtpY--dlkq_=PjrTB`Olj)-|o6O"
    "`_*5*Ouj$+tO(Rkr%m>=S(E+ovdQ^W;o^<w%c;U`Lr&)u*M5ikCguojdzEx!==TrgxOYz-$#j?-#~G@4pEP#?J&n|Vq}%C_X6-n^tq21Ll)(YrJ5arALv?i0"
    "yPNdxoXq}RCTqWH#+5AVj}KH|6^-<>q_6*f_HS3jo8rN-=5Vb4=Ok6*!AbAdaGdoD@Xw|D2jenq`?2M&uzCM~&sx-H`8b=B8Wt@&)7}^m4!3|kw08$e9T$i8"
    "JtgyOSY~ZM0n?SWn9|6L=86MxG;Piqbagam$^q7d5s6tO<ud_s?giIBo<sh(Y%=OSr;b#f8U;D9*L@J&4DR%&B2NEAH_{)@8fnOMLl7{O2o7a&yxx}ixOX#E"
    "BbAnDT95B0ZZy&K&>HA=`Ulf?9D&+#z?fn{rdjW*93A$qX1)8Ww=<przNhpbH!K0R9u7|30OP(cjj?W2f6{-X`q}`dlt$A=9cf<>v>E!biVlX^AlpBACY0mx"
    "K<WR4YLLodUyhEl(MJ5|zy1E%>n~Z{XF*obPyhPK*+*|Z{`+sv-+t@-t^Z!<ylAMmXvi2Cu&N5N`fC>}-}2)@I({%?glH17i1Q>$f`CZx!4kz1@Ad$mils;h"
    "W}%=_MEQf_4*+5LNXg@Ds;MwE&p!Cg=}&)GNpsbd$&)nZ=@TJC79@Vi;yCgA#ykZJX`mPik=~soP;fj)a=5QzaI8<hc<20gZ)|}(Yj-1K+L&?Z`vIm2iz6mI"
    "FAf_sjw0?6Mg)pfObG@&X7kDMvCa<en0@P`vo}Af#JXzA<jETI#8E)FA4{A>M8q^|%rj9j=Y(UW81{J-x8^BBJ)DLqre}Zs<JsR{w=3zii4A3xH%7=%goQ_V"
    "oNy0GNtz#$G!B{YsONczB98+h1UlJg5bbk(265AwEt(&R%0rCCUQ7e-ahx>97)E{+3LYhKL{Kb!AdEn#^&F#hPR}rII-&i>7^UY&fj*f%9+4pAyfH@Ig+(X{"
    "2%`S9KWdHfq3#1F#f7qcCENSaE3bX|)*Da$^Oe(Ie`_7%qLJRb5ffw37$d<^62=LmnE0_0tT9IFQ6@PGed<Lj@nma^1vVKg-O(J6GQD|RT<TS=dA|GE=__xX"
    "z47g{KmFtEM;|@@;^$|t|N8Xpf2^}zw%jYVY(VB-W5@v)7~??qYKe$E&8YDyPxQI2_mLk*SSCr>8gh~i2H7Ju%8N?}QjZWo4%#n&^2Pc0e{ufpPoI48k1v1r"
    "=98CRu@B&7%e^e=6)pcizpp%&Ici=KsECt9#t9OPMjmdA8408WB0f!s@IwjE$BzecI95=DrpKTCOv62W<>M#+@eO?tS9JJ`_NqI5-hAwo&?L~^HW8S`JS5G%"
    "DNJI)RS?LiID82PWD3;rm#9`4z>?|)3*f}T?-QXVNcTJ_!7*<>CJnSZ_(_17Vw{A`1LO*10%fkY5-hoH&;s6k+(g63i-qsuFbX3aHJ4QGg@K2>C?ra7NknU|"
    "@ks7x!=la}A7o*sMXR_Ro=%_G)7rHD{MWOWfBWS>e|rA*ho|5Ad>!tr*`mnKn(eJMYeHrY7gT~ocq|N5jKiW%Hib-N7;AM66;qxFeFhI%PR7}Beget($#4Jj"
    "^xHq$%6QePiMaV-OL<X*u`dW`v5IJOFGGG1^8_U%luRn(!y_J~4^=-OPhwEYXP<oj_#Zzw|K(ffzyHft)<yHZMe`=^=7Tb>wTdSmVS<W?isqNJNF*3am><Yk"
    "%dl*JL?5Yma;V0D_2SF-J}=6|YoDKe`zKR-D3^?7lbdTr^Klx(Ngy#HT3k67ar1GSE--q;OJpL5;23#;WPyrA39MZwR$w<3h~@(~LA(Hk9!E4vFqNYDMOYyM"
    "iUVyAh;xD|AXm7`P(r(@III9~t_q_0xXsf?9g~TQh#&EgHy^j@Z!64*?;|CtC)+d5)4@YEg1f@~<qu!_@&|vhm3Pt3CgT;z;qoC$DDg#v6BS5>8pFg94Wc3j"
    "mRf!hf`bV%IGdrg$7D;Cl|wSod`QNMTLV%ENjy&w;&4=AkHvwH5J4!2Vh#rqXyh<IDy;#-66J>Rf*>w1<4E{8(PyaQvU&HU4`rc8xHKX$<q2zlicd!UWS~@}"
    "z&ifNpMK}`<G1>!fB*59-}+8v&%bPQW6v*|55-7`kmNq*i9T~_()@&10p$V_<r5YW3^2qUr(-?5eGzU1_NR|efBu`V+B~NX^<Laev-y}SVVE+X_)G;Xz){fr"
    "Cbl0VDX7Q8fMcI4Fq-M`p~}bU{&Yev5Yi_fzkK%Y`&CHGt(jb#542+DVWE5(U`k``aHAFLI?N=e5+OnK&S`%ETn?hiK#mKA(pl<c^(XyEjm9z^j$13$lMmlJ"
    "|M17>pTArD<Gl}0Km6I*OTRTPgD=|et+n4<Z{K9zd`u7*w;TxZFjF{)RP)hR;71{f1d<W<d_QS_QSne`mQM~Rqb$|KTRF<wo7K0zfByFm&;InovrpdEHFq8G"
    "T4TLsV<yw)<AE@WNWgui&+;%}N%IS}QnH9Cj|e>`AWXH_tL(*-eKqWlC!uP8bN1uko_+k*`G@bVbDTBMTQp!0^qbqhib9rntiYI{*i(%O#yI4J$BJ>E1uWtq"
    "mt6YkZ0c-lg0H`R`r*rGZ~W-=?O&Yz{Qdv$?_V!pUFoIcUeVJ3VX<s3`^Cv!+%_O2KsezJ(=8ZQ0cKjM{5TX*(q5~EI+;hhs*M(wI#r(b_q#v-<niC$n7Qhc"
    "*FOI8C+`|!wQP0ati466CgSG9fKVT*Gzd|W1YSae=0c#4QbZH3BB7)v-Tnr6GLZSf^kB`$>bP|Q{qY})L-hm00;Wy$)|xOW5(lk{^&lwVNT0kS3Y!n6xRO5B"
    "_-P_#?8)}`zmIh<dzcOe#esT|wLd;T_|^H3-#-2Ln<YhEHPf3nW1@7JvKDYXKxZTfwV=kN`CS2=2+U;68TJs@g`>Tpj?(;44T^PQnI1Tf(zx|Jg2#XR_UWgu"
    "JbC>aUw-S~Phb71VW`X2dTXtjR2}ZMFseck1hE%UM8oC-)L3~w^{6Bw5WZmTZv>>np*}VT^K~ihW@Wtk%IQ15d;IAer>}f_9p$u%-l7Q;VROY#WT?D2PLMW5"
    "%6RhwGr%}x#Ux-~>i^>QLnk?m4zf`{9%aY<<1B7nD&P9q`8Pg2d;N!JZ~gPhYkxHEu})j+6)p8<Etxc%-zuR<pPW2kDo$b#k><ntSg2UbLF|R0&pgz=V&>Uo"
    "5X!+(Ta4#l|MQn0eB;aC{PfAIZyJ}KR`E@E%|||AqA<tA^N}K))8>wu#56$x5)n&y5Uci%8I4Yk$LhuYYD?>r`lDCRfBE(E5C1s(ePd`jYpiE9W-O>c%@0UD"
    "fb@{kSh%Mv9dACG)FXe7`hhGiuP7F`uaHOCFgrRK9~2)>2k%f*rvLqikN@`4`TM_k^3l)jtE1&sH(Vtp$ak<LA(if#Lmr2L2%9681Sg5&ei&)W32AZ8=XzUI"
    "{Q5Jw9y+JP{plK`!(sMlpyK_;{rfW98s*nsef-&foxl73laF3C%D}9>o^G$V-kv!Hv-!9)Vh^-{3%qs}qwa+2<u{!d_pER}%uaLz{e$cX0^*Y|-g@%dAB>r+"
    ")A+r4d=naShDMyB5eR6@^=*&R`~U#k**h<te($^IKl|p{H@`T0=WRnT^<h^u)tfhEUN91_1lPxX%?Q!}ieNG+{#i^dDSncp{R{x*mp}R9^y9bAUVH8I&A%2v"
    "-}%GY&)+WtowZ!dDk*-Nw`_Lufh$>#T*-0-LAIz@D()w8-2D1mRat!HkGd?Le*Yg&zW83bEULJ-XvTmSI9EgNTn#x$H7pK=el${#`Xd!i(n0KSyXb<0^2uwT"
    "o__x)#W?cw&kSYPP4|kXdq&eHScm)XVa%BDksvHq1UH`@t-r<yL19dB;zuZk=)<R&j}Ov8mS@KYC%}YHfAHU@AN<B*YqV!#ZGIUpK$5VKbEN5dfy1gOs-=k1"
    "n2R`!<0w&JSkqxTPUSd#sGtwr58pd|?LRE6Mtde!;&1^u3TWsB9*K~TWb^BCOb;bIPkAyH+FB(B!MdCxZQO-~sIH~S()Rt&)nsX_ZIgBL3wJ>f284QA&6&bU"
    "j2-6q3qly7VN4W_Lmz_mu^#)V(Xbz@C_O$<BbfSo_Ph5^|NiFrFF$$m(f7@(q0`oSW@{!`<}l^S_o-kBOCrygwD~3aD3)<71rsp}2vG!N*c7E|I8Ku^(rm-Y"
    "@DPTq{!LwLzx@55&VFPZx2xuQ>&=;H9Tuaqgc5~m!~*GsiNl(H5(Zo{MX@g<CL;*6g}ojt9jAYk=DEXch$`*+kMEp*`lrYL_(Gdk*<Pn@^;T_}P@4}4d?gW6"
    "e#m$tViMElH$$Wdl=5hdVnX9Mfq*(+m6sRK6H<dgy03;2$S~hr5qS3UD`&62U$Go8@0A)hDLc%52qh7mdKy(C!m#-QU=evSNk|a-Di(-%AXVWw9mzp4{>nxW"
    "8usKDpPl{qjq~rl`s71HZfEWEmhG4@n~$|Tth^9u5J{2{6f|Ea;WMHbi-R~wXhJE2fSHU`eo)-M8_VVw{i=GcAAPJxu%~~2>GZd67<WTw?erGy7?=6H=3_66"
    "Lq&YaP$0DB$Ia)IC&UxJ7X=BXfs7Im>DnL3JRfD*IPb^l@gO^r(FxG$|Hp5f{`yCcKl}AM(^Yf5_2x{p%|~B~3W0H~5=JEA4%5th%1~TPdZI)Zr62$;tx<M#"
    "q()to)zcro`uJ}@t1PQ)jhb|u55hcIEZUPE_BirmhgE-mp!C;#LPRm0!e_u8SCWm6=FcllN7Ko5KypxC)&Abu*FSpv_g|j<#|ImFvgKdWGyf8E4>-)D_Ci1A"
    "p;S@vJcYRV9RfwPFJQt6l?f9BL><=W{6yJg3^azA&iHx!&)=MWv~jM_sx=dA^TC;5u}t)F8DO6TiNm7y*h2vhV=dn#($)ZS*(N<Y9%T=w6aGVe4nrx~*;}7J"
    "`Qq)ff4oz=b+BlzXEtY|b(m5eDvSk}ifdm*NH|Qb;DpOCPGTv24%6L@rw_}_kBe0LL;28gUUk(7?Tru4|M1Q8-+%Vyk3Z3XpS<@SbAI)z-Ja2|iMjbuEyBz%"
    "E{=I538WqdHy^4cvGSDUBB7o>kU5C&PLA~`KN|rb!B773%K2x%wU6LMb6bz#<^wk2$23$yq`ZKTFlj!sg(AWkm!9v5SojEJ6nvCv#ZQat=EbN9<j_6){_h|E"
    "{q-k*{?X~1Z$JL@kLF$PqP5<7YbI5P0a_4I>BTHkNccQ-unA6!rwxWEMBJx51i2n|kcGw5*N*d(=)h^7MitkufA8$&-=2Q)vL2|Fu9VN)>ly8tWF01{6U8wn"
    "i5ICrk71k79f}C{s4lod(L$pm*sHp678RGLiU$uxD%RUNxUzft(WhtMegFJ-Z=8PiX7%;m`Crj9{t9yjNAsbbFAz$mx5olSie+kzC&^5w$KojA3}M7Vm`X7k"
    "%RyfbiiiEdj6S~g-s8_cJN@2w&fk95tP({_y|tE1pv?z#JP6`Q$%sU{^iqdwyIOMtO#FaGf-ou)*h9H^ocve~i)1@JoX<c1<m~ldZ#$gV{*rBnG<JAIh9Ec!"
    "k^obTVu#xn9u<+4p@#+YqL72!d7BKzx}~w|&sN8UBc*_D9iM;x+SxC@K3gAm`tGMszG18~UbNert&>}8*ThU*uCyyZ#xc{B^x^8TLYByoDXl7Dq9PW8%>5dw"
    "NBt~4%yO8kYo{On<@9Z1$gCUaEgCQhIxK{xB&I0D2n8(Chg$OkHQ*xD<F}Y6-1j1o3%>g@mHoV5ETf1H(m^~@AY+WTe^eBRpMCT6v%j2vV9XOK8vK7>`f1)P"
    "HEGgqK8oWZ=GYH;!W0Rpa#+C;BF0f1AStC*3Xp3*N5kS4ZQdViHyy&9|4%;r`1FfcpM3bi`R6YiUE8dw-da;8Qil;6olT|j{pOQ!R$py43#WJn;QUQP>VIJo"
    "Y<_>q?3scVvh|PW$aapxQI@B&xBE!bSci7)U*}DjPjjzV9g9D8(FaZcRQD_eK$d&O;}oO8B(xH=UR^<{Q-Z=h!2ohM-akl>tt100N#>Mf;F_er<pmG*le|3{"
    "%2Drfah<l5qHn*~fpUiwbsYB;2|$Xw0~zMWvuAyp2@)$o;gle8Pmn|G!&J8x_bz9TtPHI;_E6s`L++j-M6J1!4RzRoihDQZ=r}XqmNQM%t~r5IqQX5<h?=vj"
    "`!qdl8O3rm&aEV^np1Pye>q9_nu8!}j;=P*VK^BLRk?GV#Wzz#E-51Snu8cnSuGx5acospWOe^FUoBG3khy0lK#o-1R_}Q^%#H^qR+84~$cR&t?x!PyI31_y"
    ">HXNdJc$km%IZOoeMVBJJl)So3~@&8jpXsMuC8}<X&sc`{8l82?eo$_cXS;0L?K+DNH7`5BkQ!pmJ2W^*}?8EfFTOcJvE(`qxa<WtK}^1;^SmI*uD5*0n&qH"
    "ax903R(^Kfaq=DPUUx9a&|~`6iu-DuPg46_w2O|D>tOeyLqIg3c->ARba7Rd#Hu*lNp^^P#UT(CXKykZ4~mZRVVYa#BeALuchVi=UUdkAI$q_Ac79g9;ZCwc"
    "-0Ka2s5dtz<6>S-Z}(6=vMqpERfjv-4sowK#D`G2gW?S@8%9{fw~};H9pXDDNj(TN*G@j3=;A6z!|5(P$;axboGrE95Xzl=hkEYWVt{P#PiLXsD_$(B`^$0f"
    "vXYU#Z>jZyN$w;+6uW0jA<EEbKO1MG=)g+QegU_W_fYDdAjFlP=MS>He<d5nlc-qm*1M{X#|KrtC$%p8a3>L>?iYS2L`k}-<inHRJrxaPdZY&^n-jLnlamxt"
    "_wvL%5PwfbvUmklZ}%Wo1M30_vkH@N(jw+wm>5W58l}bSglBzC@5+J9?S7S6Wl1>M5pyp~45BPuJ5l*!t^dw!t-qP4Rh@*BB{BEv#2~8E&hW)ljf>NDznI~j"
    "**ny#O2SE$n0r-X5LM}p+#l*Lb#m0ZUOX5ul+)XvW~x>_5>C3r-0KmCs7KEg@6V3qu(z8H?K>#ku0~Fp#NDeAhp0w7YFsR6y7ppW`IEF*-DIU|7b7P};_k(W"
    "Q^>oT*VDncB2Bv%Ihhi7uSFc97G2xluew0Q?F!`NMclmtafk}^)&8yHgUq@^#O<o%WI^1$>Ij&sqvC-&9BRk4auin0@tq7vxYrzkVeW#(DxS_y+?l_k!_3nv"
    "IKGqp2={^`D9AmOblAH-u`hlJtJL^T+9TXcjR4V}<($*qV;M^;O{?ViPSPXXOOAjjId}6Y9TW@qii;*y(<y{ie0(S65$?su2f0F2+yHwd2ZIemFyAgfPSWGM"
    "7a$*^0PRk~kvdYFF8KL&{c#c=-@X3$5cOyG@ML;Rvv+x<WIjF~%wDc+=4zKBC+qRuOOel^W>)mRqK4z%6?v3Rl7ZZ}leG(ylLPtg1<Ch8CIt=TsJid;?Na3A"
    "LB4w_3Ov9Ob+Jd&${}@N6{En(h649u6kyO!^q$gXNscRqV1ZSU0w*I1+$&N5VnoHNpl~p)yz#6y-B3d{s@%U;WeS`mDR8e$0o0Z2-c2>I?z99}H42>cC~&Vv"
    "0Yo*rDo2O2eR)5fKgY|=(<(`UlN|-lB`NSAO44=R)Y=WDUHe-6tQ|8|7eUf-+*5_9Nzae6aq%FQgGt`Inm#PVcjrhCyGPQ>*se_6DP!!OF+^p$HB3g+$EsFN"
    "ADXpcrYW4#r0!{gTpT*d`*(*&*0qJeo-ZBvP6=}N1VPm3pcr&NJIUoJ-Iqu9@oE>Nz$s7nVuU=Hd5gn5Qp4G0l>1X}DCdgG)rfj7hNR=T=L%Ad)G!?vW?!)!"
    "W!8e3Byvj9y#OJI0(4!b<AdI_*>P%}n}}K|Vy6_{ix1);!<I*b;%?yXfjtd%)`FQNaZ1v?03n#M*)Ug;Hd@`6+@3FeHxu=(M5$Av?iC0_RG?df!Q?0%&Mu2x"
    "9;C&?n98|gy8=1+5O%LX7@`7wMHM&gC)SyX?c(EPKiIwaV2I*#cW`oaTs(ZF`ij`B5i?IG{lV@P2!o8pbj*R)_rYQBj<iorY}X(s3Bv9*2t(AM|2avc!`ZvL"
    "E7r!%+Az~}av<zpfe1te+ASJ8D$38ZRrkwgjTm_%C;uVt)rVjZ*HgntyTL(rta8iph*g7-lK>I-8bl~ymK)WbSVagqX%KNQLIgyE2J(>}N^dN-#HvEb$%Ke|"
    "6@r;mJ$v%-SJK?NxEEM+swr}kAon@d0mz){-C2>{c;z;rb`5eeAouCi0myXfYsUxbNEQ2Y+J{<c+C|7ogxu#*2O#sPXZv$@HFM`kf7`mmN9`))q(bf!ssoS-"
    ")pt}p$qVJXFCVJ?iB*NDU4@)n$bBAl05y+#oL4-JB%pQ)a<U-zdD8)dx-31CX|6U*oDQss(-b>tko&~x0A%9y@)GTCx<8cmn&iNmHBGUT3AxXj4nSs2U!T1r"
    "ZQ6g1i;M0rTA5l!2s^2e`@HD@WZv|w+~$X=Rer1q(-b>Nko$z`0A|9p8by;)s{73=vsbZNiCSd{JDCt`QHBDb_2q+!b@y);+|18OfSB`|-GC#Y6;_M4>0VWX"
    "u{Av5$V${nfw=Rs-9SLy&h1@$Q5_u*teI|su#Z+J`*EM?7Ki}mrhJ&?y%$E4qtwdLK4P8BN4OucAhY@IMw7uLuf7QF+fLvlKkhU60w3b6yfVrj4HqknW>*lb"
    "RIT%pIO&h?eqMr1TD+-7M=I~#)MJxJ^2Ey0av$R4KJIfC1CTk3y6{Ak;yL)LdV*VEO<1JFNqyWWECwJG7S|Kq)si<Gq*&K5ttpF?IC+r!l*IsK%Hn#u6_cR?"
    "Yu+LyP8#GsZ!riUi*9iR;UKf;{s-2yMM|7}$bH&k5I|Jkt4hXlP%Oo+ni4;2!%Wl3hJxBvH#<7YhR@(AMuAKc#Yp%}7{o%xLWEvWyrMPD$JtmF4<t99Vm$q#"
    "0pX25e);w{FP*>r?&+Ivm>`y)Ev)d~t=+x5d)IE?+Ienwok4j+>CKi^EJiBQzi>(Bxf<t}<X~`e$%yhV$3qYh(IA_|<AYQ^RA3yg+`jw5)xDdyu6^a2fuZzy"
    "iGrv{VLb>KgxMRK<nVZ;kBMU0`D}7L42^%ga(n0MwVmglzo&QJmA$+7cJ{6rST_7ZiH~2CPgOKXP{n;GNH%w$FC8VT&q@S>`UHvqP)WyXaC`t+C$3(*{rt^x"
    "jadJ%^m<mWUf#<HP>CnmU{E~WIL{I}QgCO)^}Dxk-@SkB-tOJ&JNK@cCqu=y5)D+3MmZ1^lmj)$#$boS&1<*s?it6y@{>~9xL(?`uY)C<jfRDa4#D!hd+)j3"
    "`}+Tkl-E8iWld^ky@&vn_&|myqjWe1J@0StT>iIvx1QUx&i(R+5(HWgf)ND@#8EoT01@1|_1xW3@~e+ZX|sB1&%Y0qa5fo7G9N#b!~Kbz-Y5b|{O${TS9W&y"
    "zOwV&jTd(AU0nxYZz_SP>4&8_P(bp@@Ia*_utQ+?h39TwyLHbv2G%|+<zCYY7XiSMJ~=8@Je+_f{cm^f>|D9|Z${Fq&q_(xRJ}z2sHDe_(!p%e?|6FU3?%ct"
    "`?qf2x^Z*w{?6W&o9pS9H<TFElszK~6o^N<04TU4{=PmdubBt@>Z8(I<7>L!{QGSZ=0V^EGGH?HpYc4@AD$c?AN195KOL&s56=0&|BKUq{OZ!_hhKm4`cGFF"
    "bR)gzinzUN(?(`LtW(jy@nHJlgV}F9So}r_(!~n6pT)(ycJo;x`K9W}ZLTJm`0yNGo(<CRB<>0zo&(&SH&cZW&l6qz&L)W10b+G*IE-YDQ69;`_@H=`S~ncY"
    "oa4@-ohp!Ip6v3MHjyL_BsT<yLrLc-mnPd0N;*e*d(lo6N;=PW`AeHnQU{b9g2SO?bCmJ)sf!(PWOI(QM>|$QWb-^{zp;rRb0An184e%s&s*$&O-*ueaJ+Y8"
    "7QXj?DsxeW-u7U=?ZJFo2^M#NWyXZWG&{<Q86sJpj!!x|(D?j7yRvAf>R99RBVzeWn+`YOM6fbA97?e~;*PUirExX{rzn<3-Sev^)&Pp-QL?tZ#LjnMXUB!a"
    "Hah}`)0dHVbM%S%(f8bRR&B+RC*}vo^cOZAb%7H(D=<8|{E^bFcg${g+Q>F|v)|Z2&-Yr;TaOHf&tIOfu{u(-=P|;v^OxuA)nyB7;QZxjwc1>w<}&E8!a^dO"
    "tMYzVgAIQn$@`V#41Zy;`<sRsK6XM@3JZ^Hn5yyD@~Fe{g}<zF%a*nwT>G_6C`k*HR(Lq1!5pb>xwGRin8UnYv{8jInCChDg-rlmMiv!;;n5Wf`8p<dQ#Y{<"
    "T(Nx<H`apNDlQl{<jt{##U1-@xFK)OZTf7|3UJ7qCpi6uP2?N~7gd4b(G^#=)1mAb-kn)1+wjeQWfMTr0-zBZ4k22KiX4sAQ3^hsMQAB1JIfZ<(4nPKtTvah"
    "ISec8u#m`RN8RBtdo)mSSKS0!TwH#3(N5Kox3~(t{H0CDUf=|=GB_McygK^E2Wlw68RFH!w`gDu9$p<Ji>)TLz+q%zMTNw*sCW5cM+Y5V7Q6hg>UhJ;a+Du#"
    "IMf2<1g#tw4jWk>We2(wg0FC7d63<l$6o_RmPf;4V~Li-n4%mM?5^25Ds_Ay)%>wAo$*?4q#D}#Z<NT9cI1|k;f^%AhHrG#!J$Ui(2b7D#~NKrZoajI%wf=A"
    "MTNt~*5soDSZvKa%Ba|yA5?*I7$uZqLSY(bhicgO5HOx;*xoek63g_n2OhF<G*|!We;!OD=9d<MftlcLnBWQ~*k&R?m|$Qgq#Gurf(fyi_#jLOFcaDh6I#K9"
    "+DrlvCKQ+n>xK!dU}C*2*7H0NCJdMf?}iDlV8U%C2!sg-W+J*_A}W{&n+XPCB7m9r-7xVhnD{mm0>Z=xW)gJ6B&c8#*i0x0lK_^9`6y&CCeyGbCf37{H4_HG"
    "r2f;9YclD^V^M|2B4jfG@mK`xv8Wr5MHL=vJx^LQ0r6M_?6IgDk3|(8i-^qx#A6Y#$D(dL7FBqx^-ylj1jJ)e8;^~t3?-!jidp!K9PMXAIT`DraX*VsoG%~D"
    "Hm#s6;_9(+Zyt9EXR%EWWgpD98M5zHKCR(Ejk4ur_fmuwm+m&u!2Kv4MG77V?kxgW@W2li8%sb)Z6Nay@I*-e_&^O+vCtQu3hAu}uOLGntp7rZ4y{dREet#%"
    "+8?Wd3S|V(hxS&XE9lS%tIZ`gtTvlv5O^}IxRNUm2P$oG=U_7()-%Ib5MmF^Unx=IwJ8~a;7Rd*Hha!GJSE;+g{~mPAFMW)=!n{MmO<dji2gujk<Pz^14#7N"
    "Vpp&c57xGq;P|!StfIiv@%tnBHFz+7Zx*(KiT_}>se~h_jbj=Bo<z`37OyA=h7t4<>*eRGbb<%VttJxc)kd<20Zs*Z#muPb8^2+pAg{LwY%@XLgT=-Y5>yw-"
    "A_P1U)D;o5jR@LAq_*-dLckNjT@k_Ch~P~`YCG>D1UwPa6%n$H2-!rWw&yNFz!RZe5uw|N&`m^Y+wCF*JQ3Cv5w?v8+eD<c$u2^`6X9JE;oFGtO+;$j>mmd^"
    "5z#+5IhNxNtR9KpDs%-E@nE&N#HF^lu7bdm@%wTp4@b&<E#77{es3*y1sngt+V&Eh+8VnS1)fe&&?(k|!@~)BtI!o}f(NV3CK^^-XIDYM$zZRajgAi_{859w"
    "-ZHYy1$z&cTT57KEA27{JQdWRKB5F33hFHaS1>^j78^@QYCG*B1UwPkk7e;LW_TpHw~SoD1V31AEkUWRwaXarR7hVQj?-MK4E|yYCcX9G6>P|Z^<OCAsqMJy"
    "Vc-eTel}2Y{=Q0JK(x0OyMhmWu(rK~r?&8}MS-Wo`q@!7O1e0DSZ@`&f(?7H+FU|Y+k96+z{#ki<M9bNltomV$6`wfMQ!Dse!m$7B1PZ@Jiv-3&&V`9ekQ!&"
    "hR2`3dG^`&&VKo=Cm()nCcJa&^7Fmf=2h00udHV}{b@Zr<W;^hqxeHE9p{&_;stA$Mk>!Hk-BvGO55C`!w@pLE6-jw9%?)Nv6P;uou2-B>-+|w>D@LT>})6J"
    "*H7+t>)eh&bGu{YcE`>wsGr-N*12UP1)1GE-ZH=W&t`^|FU6?Nu=sxK9LJ#hZ_n6&dv<oH{{Gu*o0|fynb(Y(dCjhwl`|@;bGz2MW~u}<x9di3*X`U${oJm%"
    "%`K6Txn18e9&){7=SFMic73OHZlD$Ay7>U_Yj$p|es0%V=LXsrTsQiH>vms2>O0Ey)_uV~sG{634CRI`D5Soi+-U75DQGRZWz>>e6}6<kpWJF)OH$Bd@|JN-"
    "-l{kz>-)*A*2m-^hs^D^`CRl}D>qu-Om6SC&Fu)Z@4jR7-FNK1o7VS|JFWZfBhd5hj&Z)-vClVJ-%IYaKHrWXLFV@S{q@|YKb3N;?<LRQZ=2f))JyIeUUJX&"
    "5?bF&?zQ%k5$O4L&p6-iRh)12z2si&^KAq=#<^#Vaqih;99rK??zJA{<cE;C?LKQfCI4AFxB6bP`)upnK>O}pqwn6e`)*p_OLklL-4oDS@`6!IUZ|)g^}XbU"
    "*0p3Z0^M;h+%xvv>_;;_R$oo@*W2dz2(+HuH|oiKyPmN6ZgRg(J)yoxB$mwgFnLBEo$SYQAcyM3@klyfCDI?9{^N&F-uqoS>t+0F%lNA+@Afuxfe*TPQTCL`"
    "C{q12%7*!+a!4>tqa&Tq5FXDe?%EBB<!2=vs4<RtC@>6TjdrYx{~Zn$IE+Q~y?OK%lJb@k7~B|)5fBPbD8rLMHcaJEH=>Wf<KhLZ(3Dn<TrnD1!rJr;C1#{4"
    "v&y(&=ms)6j1FW9&#Q=hWgdA2Y5mg@8QPf4G8iZhHB|9|9AupkDT3de1vjCrZ76YJPFxo8K+%jf>#>USu{uuD;r>N43mh5k&05)AZ^eXF^&2H>+=-eM7!=>5"
    "EF0wd6duN%aJ#R=?=Hfdz>G~LQo@PUDk2!7$w(iw*<`%06#~4Mn?=7n8Q+*kUjZs_De>_e^DzQK;fdrRN|RK@hr>y9H~<H<jQ{L1{_0k$y{!Z(XbPzu5)9Kp"
    "dZb2aG?w7SX%TwQd=I$!vB?EDR_V29U`Pgf7?TWCegIBnJ@N|3`llrxja_;b3=D_+yo1dkE}na!lW*+HEvF!uX-`JEio-!B$GNWG-~^`OFRz7P!LT-!xHNX+"
    "Qbbrp`ma)h6n;!Ti+*(#y##1&ONkG4<Fg0|hG+JUbU8dyV>tlFvxt6Y9({$UyrqPvu^^iPq42~~#d0vokK|!Gl+bt<(eEsxFY#DgN_ZNZuo(~vkBSa5l|y4$"
    "MqT1qep15FSaWBAz|ucad8DC^;Rj7c=qt<6D-g!VB^r&Tb}bqdl0?ROj5U2RZ_$MQGJMgUwQ;*><H}kaOGq2GmuNM%+p4f&*i`Y5<XjEm2T4WfYs=6pNXEw|"
    "8`9Wt*P?+TDg5x{NDjyF<DyyYJB!#WDCXxSDvdpNJscR8QT8>Z(+Eddo`UyCv*<gk=qohkEhRXOJ=hEgg-2&NR{8&)s8C68A6^E(JPW>rQ{GTw)7XWLcu;5#"
    "PU4Y_PjoJ6l<T27e8;`s!tSDlC8Wx&B~p#8*bWMZ>sXCKJy?@NIT&Oo@UWKgcjoceP+8kbpjdNIW=JSZX(UIf9O@2Wd;qUO^XS)?(U*v<EhRvW4cQC`hUZ9Q"
    "PvszwM%e&-e6@(ayNJHRQ{Ga-)7YHNfM9rr$wZH8kF=M|Vd^}4Wiy~z{5xy$SBUIwB}k2hx*QS=(@1q>hdOeF92%dNpfvX8RWK+VgH(S{k7&E7IJ4M0s$6eM"
    "pPNu<V_{wo2Z!aM9-zqZB+ucg6rp$Kq1T|Se_UdMnlo8OgGI8R4dQNy+?Yi!0hxbV;(^_G6v3cy9LcY#WF+^yn155mzP^gRL{j>^1f{VWuZIJ}lIl+Fk$k8k"
    "1>Z+6gI`f*7hT>^BGXufjd);aGX3{<akQ-Bu7IpQE3s&7yNgg@7$&(+zN2e>v)~n1`^p<iR2nO;5f2W{ScU`D)fI_(_^L}1_NEdb(HxKw5ekv6;QDJvT~%Hk"
    "{+143RebGDB}9!Cw-gZ!(eUKOSRa?*Y;@eKv$!iLtItX_8oTWx6c~n4s)r7PXmZraHHTGr>ym@L$z;PCD{d(wJfi4eGCb@K(Up1l3Pg)dB}B*_(KI3$q8HOR"
    "{hErqs>zG^RYkdCTZvL*4=#s<!gPF)jWhj!VH$NZlV&ac_40h0iftuKjm@|m5)4!JsF*$xAIWhC^0SD3XAymcsJx{FsIefM0m1N$Qk9RvN8GEhD<I2{N+cTV"
    "@jMb7g6t^GRh&$UFnJ_Lk<2?FGHd1ftd%RvR@MM*_>B@T-keueU@&|q`?|YNi+jr15dN;rGW_l${0f-0sYI%=L6;&zAsR{e`F-=4OBnN?O9UDVauEhD?MGep"
    ";W~6x_icV$Vi7cF@d&!p9?7p|qi7%>!2?+ZUc<5a(1gLg<}l{5z)+|`>ikfn%^Vg{R}dDTln6A|-B}>m^z#EX7<4tVUTdOibX~o<L<zf5GNQsEn=a)nu5omB"
    "%WbWV%G+)mwwI`p=G5%4P}p+)rQvjkK*KU3FA*7^mcTT&-c>L-9Qn!dL2(gLj&gV+v*3I4;A>FK4J9tDIhVC~U}z50VU`pI1b?fxh<!J?vxvO{V}4%Z(%5y^"
    "!+~KL$cL(v8RpZ-*6ecQ(-M%zO1laMhGR0EttZP5Cmqz3MfBZy^c9x!mJ*uAu4@K_!*i@gc{WJnZVYD?|DNSK728UXg65FSkWiS$qvEClc$ry+UA;DT`H{&&"
    "G<M*5Bq#(A(`=yisH-v3JbcwS$=*~#(^!s65up%0Djr-B9i;Hjn9z~$EF&+$7@wAyG*;nNFhCp~oi{r2o_*>VpO$bC2ON8_C(xtfy?*+LI{|+(LJ|4eBJv8y"
    "`llrvjm>ry3=GF89qXfQe_Rxm2!7qcBL3bg{tAt~tpupC;+8`;e6IlEoJd9lX8!CcPPOXnmoNS7{H@<@e3sL4!yL(?-u2d5tbb@e*@<8Lq`2w3$S*BJv`%^q"
    "n(kiTNObyRDMi0-ihKRG$wi?1@`~|HwJY{B)p$@dwJSRf-z0Bmb_AN)MNiomUfs;@w9PCA-Dg*Kj01A^V<|UWGdKO^wg;q&A(Ojy)ktpkV<|aWGdca`w#n@$"
    "kjdRJo??5$eu}MNHB-BBz3nl109qt(nnm(vMUfPuW^Omz7s=xsGP&d2NN)CHDY?33Qh&L1awnk4o%|2;{^I|zlJo0UO8w=w$>qn8$?ZOG?77*GrR3_CO8w;)"
    "$zdUQka%&xIetdE_6Mi$e0=)$KP^KsI`N%yCys;4wL?epc$QgyX=ev4vluqBt43y5?acfOGP~NMPMVqR!)A8F$n1ulS#UvSH=r^Lv-kuww|T(TqrGN7oB35P"
    "z*)<$_!87n86gCk;4I$i$tcqwOX;EQ>FMu4?Y{_N;OwxO9k#Q>7iEXxvLnFR5i>htXGbo|jzDD>X9;L_vv{kA(qxI99o?Rt{tnc6r-rcIfij<|sI2EG>g?F|"
    ">{QbyC2q@Z|AGg$HqGzab2n~1XAFPlACz+B+jE?L3+f0x$U##)Fds0G+sR$vDhD}KW{1P<(Llxf3N*p>sLMRpKP;ttfxs-k33b#CWIpak=@_=lFQWG5QCCYV"
    "^@k7UAC|JdKyH@bgxc5BtTUOXIeglSux8$iPtC-cS0nN1S3&o8o(>+WQGYZ6E?Cq2XTf{(;3kFHwg>ZVB^Ia#i?skyL`EY}1|wq%{Agt7d4VjAMo^jMW0}DE"
    "#3JJAZu|U$Qi>NC)AU<VS&n6T(R<jNrnwBcx`Dp<q?G6d@-+JzSf)kLKJ3_K6?2vA@}p9+7r4~?dl%H`|Lgz${{i|(ybfXr3jh"
)


def fixed_catalog_payload() -> dict[str, Any]:
    compressed = base64.b85decode(CATALOG_B85.encode("ascii"))
    payload = json.loads(gzip.decompress(compressed).decode("utf-8"))

    # The corrected Hypertime Oracle deck uses AI III 001–006. The original
    # 0.2.11 APK manifest had the front of 001 missing and still listed the
    # obsolete 007 pair, so keep the scan index aligned with the corrected
    # project files instead of that stale APK range.
    corrected_oracle_items = []
    for item in payload["items"]:
        if item.get("number") == "HYPERTIME_ORACLE_AI_III_007":
            continue
        if item.get("number") == "HYPERTIME_ORACLE_AI_III_001":
            item["faces"]["front"] = "aibp/ps/HYPERTIME_ORACLE/HYPERTIME_ORACLE_AI_III_001.jpg"
        corrected_oracle_items.append(item)
    payload["items"] = corrected_oracle_items

    # 地图页的标记素材由项目目录维护。清单最初只收录了旧版 APK 中的
    # 20 个文件；地图实现后来更换了文件名并增加了 C4/C5 专用标记。
    # 以当前 map/app.js 使用的资源为准，避免导出资料包继续引用已删除的
    # AA.png、AG.jpg 等旧路径。
    map_token_files = {
        "AG": "argo.png",
        "AD": "adversary.png",
        "c11": "c11.jpg",
        "c12": "c12.jpg",
        "c13": "c13.jpg",
        "ENGIN": "engine_nymph.png",
        "hs": "hemolia_scout.png",
        "last_city": "last_visited_city.png",
        "night_nymph": "night_nymph.png",
        "last_oasis": "last_visited_oasis.png",
        "c4_city_of_squalor": "c4_city_of_squalor.png",
        "c4_cloud_ship": "c4_cloud_ship.png",
        "sandstorm": "sandstorm.jpg",
        "last_silver_ruin": "silver_remnant.png",
        "c5_ae_siren": "c5_ae_siren.png",
        "c5_atlantean_capital": "c5_atlantean_capital.png",
        "c5_black_beak": "c5_black_beak.png",
        "c5_last_visited_underwater_city": "c5_last_visited_underwater_city.png",
        "c5_nemesis": "c5_nemesis.png",
        "c5_ruin": "c5_ruin.png",
        "taitan": "reward_token_3.png",
        "staff": "reward_token_2.png",
        "body": "reward_token_1.png",
        "knowledge": "reward_token_4.png",
        "rr": "reward_token_6.png",
        "dof": "reward_token_5.png",
        "end": "end.png",
        "AA": "adrianes_anchor.png",
    }
    payload["items"] = [
        item for item in payload["items"]
        if not any(path.startswith("map/tokens/") for path in item.get("faces", {}).values())
    ]
    map_cycles = {
        "c11": ["c1"], "c12": ["c1"], "c13": ["c1"],
        "last_oasis": ["c4"], "c4_city_of_squalor": ["c4"],
        "c4_cloud_ship": ["c4"], "sandstorm": ["c4"],
        "last_silver_ruin": ["c5"], "c5_atlantean_capital": ["c5"],
        "c5_ae_siren": ["c5"],
        "c5_black_beak": ["c5"], "c5_last_visited_underwater_city": ["c5"],
        "c5_nemesis": ["c5"], "c5_ruin": ["c5"], "AA": ["c3"],
    }
    unique_tokens = {"AG", "AD", "hs", "c5_last_visited_underwater_city", "c5_ae_siren"}
    square_tokens = {"c11", "c12", "c13", "c4_city_of_squalor", "c4_cloud_ship", "c5_atlantean_capital", "c5_ruin", "AA"}
    for order, (number, filename) in enumerate(map_token_files.items()):
        label = MAP_TOKEN_LABELS.get(number, f"地图标记（{number}）")
        cycle = map_cycles.get(number, [])
        payload["items"].append({
            "id": make_id("common", "通用标记", "地图标记", number, label),
            "cycle": "common", "module": "通用标记", "subgroup": "地图标记",
            "name": label, "number": number, "sort_order": 58_000 + order,
            "faces": {"front": f"map/tokens/{filename}"}, "capture_required": True,
        })
    existing_ids = {item["id"] for item in payload["items"]}
    for order, (filename, (label, subgroup)) in enumerate(HERO_RECORD_ICONS.items()):
        stem = filename.rsplit(".", 1)[0]
        item = CatalogItem(
            id=make_id("common", "英雄记录表图标", subgroup, stem, stem),
            cycle="common",
            module="英雄记录表图标",
            subgroup=subgroup,
            name=label,
            number=stem,
            sort_order=order,
            faces={"front": f"hero/assets/{filename}"},
        )
        if item.id not in existing_ids:
            payload["items"].append({
                "id": item.id,
                "cycle": item.cycle,
                "module": item.module,
                "subgroup": item.subgroup,
                "name": item.name,
                "number": item.number,
                "sort_order": item.sort_order,
                "faces": item.faces,
                "capture_required": item.capture_required,
            })
            existing_ids.add(item.id)

    existing_paths = {
        path
        for item in payload["items"]
        for path in item.get("faces", {}).values()
    }
    for order, stem in enumerate(AIBP_TOKEN_LABELS):
        path = f"aibp/ps/other/token/{stem}.png"
        if stem == "Ambrosia":
            path = "aibp/ps/other/token/Ambrosia .png"
        if stem in {"CA", "CM", "GF"}:
            path = f"aibp/ps/other/token/{stem}.jpg"
        if path in existing_paths:
            continue
        id_number = simple_group_id_number(path, stem)
        item = CatalogItem(
            id=make_id("common", "通用标记", "AIBP 标记", id_number, AIBP_TOKEN_LABELS[stem]),
            cycle="common",
            module="通用标记",
            subgroup="AIBP 标记",
            name=AIBP_TOKEN_LABELS[stem],
            number=stem,
            sort_order=order,
            faces={"front": path},
        )
        if item.id not in existing_ids:
            payload["items"].append({
                "id": item.id,
                "cycle": item.cycle,
                "module": item.module,
                "subgroup": item.subgroup,
                "name": item.name,
                "number": item.number,
                "sort_order": item.sort_order,
                "faces": item.faces,
                "capture_required": item.capture_required,
            })
            existing_ids.add(item.id)

    additions: list[CatalogItem] = []

    cycle_symbol_files = {
        "c1": ("c1-brown.png", "循环 I 图标"),
        "c2": ("c2-red.png", "循环 II 图标"),
        "c3": ("c3-purple.png", "循环 III 图标"),
        "c4": ("c4-yellow.png", "循环 IV 图标"),
        "c5": ("c5-black-transparent.png", "循环 V 图标"),
    }
    for order, (cycle, (filename, name)) in enumerate(cycle_symbol_files.items()):
        additions.append(CatalogItem(
            id=make_id(cycle, "循环图标", "循环图标", cycle, name),
            cycle=cycle,
            module="循环图标",
            subgroup="循环图标",
            name=name,
            number=cycle,
            sort_order=49_000 + order,
            faces={"front": f"assets/cycle-symbols/{filename}"},
        ))

    additions.append(CatalogItem(
        id=make_id("c1", "exploration", "cards", "8201", "8201"),
        cycle="c1", module="探索卡", subgroup="探索卡",
        name="8201", number="8201", sort_order=0,
        faces={"front": "assets/exploration-cards/c1/8201.png"},
    ))

    # C2 补录卡：实体卡号 BB1241「招募活动 / RECRUITMENT DRIVE」。app 的牌组列表
    # （index.html 的 explorationDecks.c2）跳过了 BB1239–BB1241，清单自然也没有这张。
    # 卡号取 C2 段的下一号 13642（不动既有卡号：它同时是牌库键、标签键和图片文件名），
    # sort_order 接在 C2 现有探索卡之后（C2 那批是 41–82）。
    additions.append(CatalogItem(
        id=make_id("c2", "exploration", "cards", "13642", "13642"),
        cycle="c2", module="探索卡", subgroup="探索卡",
        name="13642", number="13642", sort_order=83,
        faces={"front": "assets/exploration-cards/c2/13642.png"},
    ))

    # AIBP overview sheets, shared physical cards, and cycle traits are useful
    # capture/install targets, not the audit/contact-sheet derivatives that the
    # original APK catalog builder intentionally skipped.
    for order, enemy in enumerate(AIBP_NAMES):
        additions.append(CatalogItem(
            id=make_id(AIBP_CYCLES[enemy], "AIBP", f"{enemy} / 使徒面板", enemy, enemy),
            cycle=AIBP_CYCLES[enemy],
            module="AIBP",
            subgroup=f"{enemy} / 使徒面板",
            name=f"{AIBP_NAMES[enemy]}使徒完整面板",
            number=enemy,
            sort_order=50_000 + order,
            faces={"front": f"aibp/ps/{enemy}/{enemy}.jpg"},
        ))
    additions.extend((
        CatalogItem(
            id=make_id("common", "AIBP", "特殊卡", "SW", "单重损伤"),
            cycle="common", module="AIBP", subgroup="特殊卡",
            name="单重损伤 / Single Wound", number="SW", sort_order=50_100,
            faces={"front": "aibp/ps/other/SW.jpg"},
        ),
        CatalogItem(
            id=make_id("common", "AIBP", "特殊卡", "DW", "双重损伤"),
            cycle="common", module="AIBP", subgroup="特殊卡",
            name="双重损伤 / Double Wound", number="DW", sort_order=50_101,
            faces={"front": "aibp/ps/other/DW.jpg"},
        ),
        CatalogItem(
            id=make_id("common", "AIBP", "通用 Trait", "COMMON_TR_001", "Vicious"),
            cycle="common", module="AIBP", subgroup="通用 Trait",
            name="恶毒 / Vicious（通用 Trait）", number="COMMON_TR_001", sort_order=50_102,
            faces={"front": "aibp/ps/other/trait/COMMON_TR_001.jpg"},
        ),
        # 逆行动量（CT1326）：应用里只在 C3 Boss 的 Trait 列表可选
        # （aibp/index.html 的 commonTraitTitles[2] 与 isCommonTraitAvailable），
        # 图片路径由 commonTraitSrc() 拼成 ps/other/trait/COMMON_TR_002.jpg，
        # 但清单此前漏登记，导致素材库不提示拍摄、打包也带不上它。
        CatalogItem(
            id=make_id("common", "AIBP", "通用 Trait", "COMMON_TR_002", "Reverse Momentum"),
            cycle="common", module="AIBP", subgroup="通用 Trait",
            name="逆行动量 / Reverse Momentum（通用 Trait）", number="COMMON_TR_002", sort_order=50_103,
            faces={"front": "aibp/ps/other/trait/COMMON_TR_002.jpg"},
        ),
    ))

    for order, (cycle, subgroup, number, title) in enumerate(CYCLE_TRAIT_CARDS):
        additions.append(CatalogItem(
            id=make_id(cycle, "AIBP", subgroup, number, title),
            cycle=cycle,
            module="AIBP",
            subgroup=subgroup,
            name=f"{title}（{subgroup}）",
            number=number,
            sort_order=50_104 + order,
            faces={"front": f"aibp/ps/other/trait/{number}.jpg"},
        ))

    additions.append(CatalogItem(
        id=make_id("c4", "通用标记", "地图标记", "sandstorm", MAP_TOKEN_LABELS["sandstorm"]),
        cycle="c4",
        module="通用标记",
        subgroup="地图标记",
        name=MAP_TOKEN_LABELS["sandstorm"],
        number="sandstorm",
        sort_order=58_000,
        faces={"front": "map/tokens/sandstorm.jpg"},
    ))

    for order, filename in enumerate(NEW_SUMMON_CARD_FILES):
        path = f"record/assets/godforms-nymphs/{filename}"
        stem = Path(filename).stem
        name = component_display_name(path, stem)
        additions.append(CatalogItem(
            id=make_id("common", "英雄/盟友", "神形/宁芙", stem, name),
            cycle="common",
            module="英雄/盟友",
            subgroup="神形/宁芙",
            name=name,
            number=stem,
            sort_order=59_000 + order,
            faces={"front": path},
        ))

    additions.extend((
        CatalogItem(
            id=make_id("c1.5", "故事书配图", "章节配图", "DY1P5", "破碎的图纹"),
            cycle="c1.5", module="故事书配图", subgroup="章节配图",
            name="后日奥德赛：破碎的图纹章节配图", number="DY1P5", sort_order=51_000,
            faces={"front": "story/images/OO/DY1P5.png"},
        ),
        CatalogItem(
            id=make_id("c2.5", "故事书配图", "章节配图", "DY2P5", "破碎的锁链"),
            cycle="c2.5", module="故事书配图", subgroup="章节配图",
            name="后日奥德赛：破碎的锁链章节配图", number="DY2P5", sort_order=51_001,
            faces={"front": "story/images/OO/DY2P5.png"},
        ),
    ))
    story_battle_labels = {
        "c1": {
            "ambush-battle-2": "伏击战",
            "temenos-battle-2": "吞域兽之战",
            "there-is-no-maze-battle-2": "没有迷宫之战",
            "hekaton-battle-2": "百臂巨人之战（二）",
            "hekaton-battle-3": "百臂巨人之战（三）",
            "pursuer-battle-2": "赫尔墨斯追踪者之战",
            "labyrinthauros-battle-2": "迷宫机牛之战",
            "pursuit-s-end-battle-2": "追踪的终结之战",
        },
        "c2": {
            **{f"cruel-sermon-battle-{n}": f"残酷说教之战（{n}）" for n in range(1, 6)},
            **{f"cyclonus-battle-{n}": f"独眼巨人之战（{n}）" for n in range(1, 4)},
            **{f"chimera-metastasios-battle-{n}": f"蠕变奇美拉之战（{n}）" for n in range(1, 7)},
            **{f"what-is-this-battle-{n}": f"这是什么？之战（{n}）" for n in range(1, 4)},
            **{f"the-burden-battle-{n}": f"重担之战（{n}）" for n in range(1, 7)},
        },
        "c3": {
            "race-the-sun-battle": "与日竞赛战斗",
            "icarian-harpy-battle": "伊卡洛斯鹰身女妖战斗",
            "endure-the-sun-battle": "忍受烈日战斗",
            "burden-hardest-to-bear-battle": "最难承受的重担战斗",
            "hypertime-oracle-battle-1": "超时神谕战斗（一）",
            "hypertime-oracle-battle-2": "超时神谕战斗（二）",
        },
        "c4": {
            "demidjinn-battle": "半神迪精之战",
            "midascore-battle-level-1": "迈达狮之战（等级 1）",
            "midascore-battle-level-2-plus": "迈达狮之战（等级 2+）",
            "pandora-horizon-battle": "潘多拉地平线之战",
            "reap-the-whirlwind-battle": "收割旋风之战",
            "the-crash-battle": "坠毁之战",
            "the-winnowing-battle": "扬谷之战",
        },
    }
    story_battle_paths = {
        "c1": [
            ("ambush-battle-2", "伏击战-ambush-battle-2.jpg"),
            ("temenos-battle-2", "吞域兽之战-temenos-battle-2.jpg"),
            ("there-is-no-maze-battle-2", "没有迷宫之战-there-is-no-maze-battle-2.jpg"),
            ("hekaton-battle-2", "百臂巨人之战-hekaton-battle-2.jpg"),
            ("hekaton-battle-3", "百臂巨人之战-hekaton-battle-3.jpg"),
            ("pursuer-battle-2", "赫尔墨斯追踪者战斗-pursuer-battle-2.jpg"),
            ("labyrinthauros-battle-2", "迷宫牛之战-labyrinthauros-battle-2.jpg"),
            ("pursuit-s-end-battle-2", "追踪的终结之战-pursuit-s-end-battle-2.jpg"),
        ],
        "c2": [
            *[(f"cruel-sermon-battle-{n}", f"残酷说教之战-{n}.png") for n in range(1, 6)],
            *[(f"cyclonus-battle-{n}", f"独眼巨人之战-{n}.png") for n in range(1, 4)],
            *[(f"chimera-metastasios-battle-{n}", f"蠕变奇美拉之战-{n}.png") for n in range(1, 7)],
            *[(f"what-is-this-battle-{n}", f"这是什么？之战-{n}.png") for n in range(1, 4)],
            *[(f"the-burden-battle-{n}", f"重担之战-{n}.png") for n in range(1, 7)],
        ],
        "c3": [
            ("race-the-sun-battle", "与日竞赛战斗.jpg"),
            ("icarian-harpy-battle", "伊卡洛斯哈尔皮战斗.jpg"),
            ("endure-the-sun-battle", "忍受烈日战斗.jpg"),
            ("burden-hardest-to-bear-battle", "最难承受的重担战斗.jpg"),
            ("hypertime-oracle-battle-1", "超时光先知战斗1.jpg"),
            ("hypertime-oracle-battle-2", "超时光先知战斗2.jpg"),
        ],
        "c4": [(stem, f"{stem}.jpg") for stem in story_battle_labels["c4"]],
    }
    for cycle, entries in story_battle_paths.items():
        for order, (stem, filename) in enumerate(entries):
            additions.append(CatalogItem(
                id=make_id(cycle, "故事书配图", "战斗配图", stem, story_battle_labels[cycle][stem]),
                cycle=cycle, module="故事书配图", subgroup="战斗配图",
                name=story_battle_labels[cycle][stem], number=stem, sort_order=52_000 + order,
                faces={"front": f"story/images/battles/{cycle}/{filename}"},
            ))
    for page in range(153, 186):
        additions.append(CatalogItem(
            id=make_id("c5", "故事书补充页", "C5 补充页", str(page), f"第 {page} 页"),
            cycle="c5", module="故事书补充页", subgroup="C5 补充页",
            name=f"C5 故事书补充页：第 {page} 页", number=str(page), sort_order=53_000 + page,
            faces={"front": f"story/images/c5/supplement-pages/page-{page}.jpg"},
        ))

    additions.append(CatalogItem(
        id=make_id("common", "决战版图", "战斗版图", "battle-board", "决战版图"),
        cycle="common", module="决战版图", subgroup="战斗版图",
        name="决战版图（仅实际战斗区域）", number="battle-board", sort_order=54_000,
        faces={"front": "ss/battle-board.jpg"},
    ))
    for order, (name, front, back) in enumerate(BATTLE_TERRAIN_PIECES):
        faces = {"front": f"ss/terrain/{front}"}
        if back:
            faces["back"] = f"ss/terrain/{back}"
        additions.append(CatalogItem(
            id=make_id("common", "决战版图", "地形板块", Path(front).stem, name),
            cycle="common", module="决战版图", subgroup="地形板块",
            name=f"地形板块：{name}{'（双面）' if back else ''}",
            number=Path(front).stem, sort_order=54_100 + order,
            faces=faces,
        ))
    for order, stem in enumerate(TERRAIN_CARD_STEMS):
        label = " ".join(part.capitalize() for part in stem.split("-"))
        additions.append(CatalogItem(
            id=make_id("common", "决战版图", "地形卡", stem, label),
            cycle="common", module="决战版图", subgroup="地形卡",
            name=f"地形卡：{label}", number=stem, sort_order=54_300 + order,
            faces={"front": f"ss/terrain-cards/{stem}.jpg"},
        ))

    additions.extend((
        CatalogItem(
            id=make_id("c5", "地图模块图标", "地图状态图标", "surface", "水上"),
            cycle="c5", module="地图模块图标", subgroup="地图状态图标",
            name="C5 水上地图状态 Logo", number="水上", sort_order=54_000,
            faces={"front": "map/images/c5-face-a.png"},
        ),
        CatalogItem(
            id=make_id("c5", "地图模块图标", "地图状态图标", "diving", "潜水"),
            cycle="c5", module="地图模块图标", subgroup="地图状态图标",
            name="C5 潜水地图状态 Logo", number="潜水", sort_order=54_001,
            faces={"front": "map/images/c5-face-b.png"},
        ),
    ))

    for cycle_number in range(1, 6):
        additions.append(CatalogItem(
            id=make_id(f"c{cycle_number}", "科技树总览", "科技树页面", str(cycle_number), "科技树"),
            cycle=f"c{cycle_number}", module="科技树总览", subgroup="科技树页面",
            name=f"循环 {cycle_number} 科技树总览", number=f"C{cycle_number}", sort_order=55_000 + cycle_number,
            faces={"front": f"technology/images/tech_tree_pages/cycle{cycle_number}_tree_v24.png"},
        ))
    for order, (stem, (cycle, label)) in enumerate(TITAN_IMAGE_LABELS.items()):
        additions.append(CatalogItem(
            id=make_id(cycle, "泰坦职业配图", "泰坦职业", stem, label),
            cycle=cycle, module="泰坦职业配图", subgroup="泰坦职业",
            name=f"泰坦职业配图：{label}", number=stem, sort_order=56_000 + order,
            faces={"front": f"technology/images/titans/{stem}.png"},
        ))

    additions.append(CatalogItem(
        id=make_id("c3", "装备卡", "装备卡", "CJ1475", "倒刺锯"),
        cycle="c3", module="装备卡", subgroup="装备卡",
        name="倒刺锯 / Barbed Saw（中文版）", number="CJ1475", sort_order=57_000,
        faces={"front": "technology/images/gear_cards/cj1475.jpg"},
    ))

    # 主控台 BGM：不进程序包，由使用者在根目录 assets/bgm/ 自备（见 assets/bgm/README.md）。
    # 这里只登记条目，capture_required=False 表示不需要拍摄；音频随 .atopack 的
    # bgmFiles 段分发（app/bgm_resources.py）。
    for order, (stem, label) in enumerate(BGM_TRACKS):
        additions.append(CatalogItem(
            id=make_id("common", "背景音乐", "主控台 BGM", stem, label),
            cycle="common", module="背景音乐", subgroup="主控台 BGM",
            name=f"{label}（{stem}）", number=stem, sort_order=70_000 + order,
            faces={"front": f"assets/bgm/{stem}.mp3"},
            capture_required=False,
        ))

    for item in additions:
        if item.id in existing_ids or any(path in existing_paths for path in item.faces.values()):
            continue
        payload["items"].append({
            "id": item.id,
            "cycle": item.cycle,
            "module": item.module,
            "subgroup": item.subgroup,
            "name": item.name,
            "number": item.number,
            "sort_order": item.sort_order,
            "faces": item.faces,
            "capture_required": item.capture_required,
        })
        existing_ids.add(item.id)
        existing_paths.update(item.faces.values())

    for item in payload["items"]:
        path = next(iter(item.get("faces", {}).values()), "")
        if path.startswith((
            "aibp/ps/other/token/",
            "aibp/ps/other/resouce/",
            "map/tokens/",
            "record/assets/resource-icons/",
            "hero/assets/argonaut_",
            "record/assets/ally/",
            "record/assets/godforms-nymphs/",
        )):
            item["name"] = component_display_name(path, item.get("number"))
        if path.startswith("aibp/ps/other/token/"):
            marker = str(item.get("number") or "").strip()
            item["sort_order"] = list(AIBP_TOKEN_LABELS).index(marker)
    c1_exploration = sorted(
        (item for item in payload["items"] if item["cycle"] == "c1" and item["module"] == "探索卡"),
        key=lambda item: int(item["number"]),
    )
    for order, item in enumerate(c1_exploration):
        item["sort_order"] = order
    payload["source"]["catalog_items"] = len(payload["items"])
    # 新增或改动清单条目时**必须**给这个版本号加后缀：ensure_fixed_catalog() 只在库里的
    # catalog_version 与这里不同时才重写清单，否则老素材库永远收不到新条目（看不到、
    # 也就不会提示补图、更不会进资料包）。apply_catalog 只用 insert/update，并删除
    # 「既不在新清单、也没有素材」的条目，已有素材不会被碰。
    payload["source"]["catalog_version"] = (
        "ATO-Local-0.2.11+complete-import-assets-14-cycle-symbols"
        "+c45-trait-common-tr-002+c2-exploration-13642+remove-unused-c45-conditions"
    )
    return payload


def collect_supplemental_resources(ato_root: Path) -> tuple[list[CatalogItem], set[str]]:
    """登记 ``aibp/ps/other/`` 里"不在内置清单、但必须随资源包分发"的**素材**。

    内置清单只覆盖 ``token/``、``resouce/`` 图片两个前缀；这个目录下
    另有由运行时脚本按固定路径取用的``二进制素材``（``.bin``），目录名不体现内容。
    它们不在内置清单里，打包器就不会带、素材库也不会提示，所以在这里按"目录里实际
    存在哪些文件"逐张登记；缺哪张就登记哪张。

    只登记 ``.bin``，同一目录下的 ``*.js`` 一律不登记：那些是**程序数据**，由页面以
    ``<script src>`` 直接引用、随程序包（Portable / Docker / APK）分发——见
    tools/packaging/docker/compose.yaml 与 tools/test_packaging_exclusions.py 的既定
    口径；塞进资源包等于走错分发渠道。

    隐藏文件跳过。
    """
    base = Path(ato_root) / "aibp" / "ps" / "other"
    if not base.is_dir():
        return [], set()
    items: list[CatalogItem] = []
    paths: set[str] = set()
    # 发布构建没有私有素材；可提交的路径名单让 APK 与资源包使用相同的条目 ID。
    relatives = {
        member.relative_to(base).as_posix()
        for member in base.rglob("*.bin")
        if member.is_file() and not member.name.startswith(".")
    }
    for manifest in base.glob("*/catalog.json"):
        declared = json.loads(manifest.read_text(encoding="utf-8"))
        for relative in declared.get("targets", []):
            parts = relative.split("/") if isinstance(relative, str) else []
            if (not parts or any(not part or part in (".", "..") for part in parts)
                    or "\\" in relative or ":" in relative or not relative.endswith(".bin")):
                raise ValueError(f"无效的补充素材路径：{relative}")
            relatives.add(relative)
    for order, relative in enumerate(sorted(relatives)):
        member = Path(relative)
        target = f"aibp/ps/other/{relative}"
        if target in paths:
            continue
        number = member.name
        items.append(
            CatalogItem(
                id=make_id("common", "决战版图", "赫利俄斯卡图", number, relative),
                cycle="common",
                module="决战版图",
                subgroup="赫利俄斯卡图",
                name=component_display_name(target, member.stem),
                number=number,
                sort_order=52000 + order,
                faces={"front": target},
                capture_required=0,
            )
        )
        paths.add(target)
    return items, paths


def ensure_fixed_catalog(db: Database) -> dict[str, int]:
    # Retire these unused entries even when the old library already has images.
    # Foreign-key cascades remove their revisions and skipped-face records.
    with db.connect() as conn:
        conn.execute(
            "DELETE FROM catalog_items WHERE module=? AND subgroup=?",
            ("状态卡", "C4/C5 状态"),
        )
    payload = fixed_catalog_payload()
    source = payload["source"]
    current = db.get_meta("catalog_source", {})
    existing = db.one("SELECT COUNT(*) AS n FROM catalog_items")["n"]
    if existing and current.get("catalog_version") == source["catalog_version"]:
        return {"items": existing, "aibp_enemies": source["aibp_enemies"], "stories": len(source["stories"])}
    return apply_catalog(db, [CatalogItem(**item) for item in payload["items"]], source)
