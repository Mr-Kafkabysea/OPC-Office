// The chairman floor only. The shared floor_open template stays the departmental office; this group is hidden
// until that floor is the open one. It uses the shared floor geometry with lightmaps baked without department furniture.
import * as THREE from 'three';
import { arcPoint, boardroomLayout } from '../lib/executive.js';

const HIDE = /^(table_\d+|poufs|laptops|laptop_screen_\d+|mugs|sofa|armchair_\d+|coffee_table|coffee_bar|bar_stools|pendants|tree_\d+)$/;
const FLOOR_NAME = 'baked_chairman_floor';

export async function buildBoardroom(open, baseUrl) {
  if (!open || open.getObjectByName('boardroom')) return;
  const g = new THREE.Group();
  g.name = 'boardroom';
  g.visible = false;

  const sharedFloor = open.getObjectByName('baked_floor');
  if (sharedFloor?.isMesh) {
    const floor = sharedFloor.clone(false);
    floor.name = floor.userData.bakedName = FLOOR_NAME;
    const map = await new THREE.TextureLoader().loadAsync(`${baseUrl}/${FLOOR_NAME}.jpg`).catch(() => {
      // A missing asset should not bring the departmental furniture shadows back.
      return new THREE.DataTexture(new Uint8Array([220, 216, 208, 255]), 1, 1);
    });
    map.flipY = false;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    floor.material = sharedFloor.material.clone();
    floor.material.map = map;
    g.add(floor);
  }

  const oak = mat(0xD9C39F, 0.62);
  const black = mat(0x1C1C1E, 0.45, 0.25);
  const fabric = mat(0xE4E0D8, 0.95);
  const graphite = mat(0x2C3138, 0.78);
  const white = mat(0xF4F2EE, 0.72);
  const leaf = mat(0x4F7A45, 0.75);
  const pot = mat(0xF1EFEB, 0.55);
  const device = mat(0x2A2E33, 0.4, 0.35);

  const pose = boardroomLayout();
  const { cx, cz, radius, deskHalf } = pose;
  const outer = radius + deskHalf;
  const inner = radius - deskHalf;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, Math.PI, 0, true);     // outer half, opening toward +z after rotateX
  shape.absarc(0, 0, inner, 0, Math.PI, false);
  const deskGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.046, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 40,
  });
  deskGeo.rotateX(-Math.PI / 2);
  const desk = new THREE.Mesh(deskGeo, oak);
  desk.name = 'boardroom_desk';
  desk.position.set(cx, 0.694, cz);
  desk.rotation.y = Math.PI / 2;                         // the built arc opens +z; turn it toward the open aisle (+x)
  g.add(desk);

  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.66, 14);
  for (const phi of [-Math.PI / 3, 0, Math.PI / 3]) {
    const p = arcPoint(radius, phi);
    const leg = new THREE.Mesh(legGeo, black);
    leg.position.set(p.x, 0.33, p.z);
    g.add(leg);
  }

  // One small device per chair, on the desk. Nothing else on the table, and nothing inside the arc.
  const devGeo = new THREE.BoxGeometry(0.22, 0.01, 0.14);
  for (let i = 0; i < pose.staff.length; i++) {
    const phi = (-3 + 2 * i) * Math.PI / 8;
    const p = arcPoint(radius, phi);
    const dev = new THREE.Mesh(devGeo, device);
    dev.position.set(p.x, 0.752, p.z);
    dev.rotation.y = phi + Math.PI / 2;
    g.add(dev);
  }

  addChair(g, graphite, black, pose.chairman.x, pose.chairman.z, pose.chairman.yaw, 1.08);
  for (const s of pose.staff) addChair(g, fabric, black, s.x, s.z, s.yaw, 1);

  // Two ceiling lamps over the arc, the same idea as the other floors' pendants. Not over the open path.
  for (const phi of [-Math.PI / 5, Math.PI / 5]) {
    const p = arcPoint(radius - 0.15, phi);
    const x = p.x, z = p.z;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 18, 1, true), black);
    shade.position.set(x, 2.12, z);
    shade.rotation.x = Math.PI;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.55, 6), black);
    cable.position.set(x, 2.42, z);
    g.add(shade, cable);
  }

  // Storage and a plant against the walls. The rear-right stays empty floor.
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.72, 2.3), white);
  side.position.set(-7.32, 0.36, 3.55);
  const sideTop = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.028, 2.36), oak);
  sideTop.position.set(-7.32, 0.734, 3.55);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.58, 0.36), white);
  back.position.set(-5.5, 0.29, -5.48);
  const backTop = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.028, 0.4), oak);
  backTop.position.set(-5.5, 0.594, -5.48);
  const potMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.26, 16), pot);
  potMesh.position.set(-6.65, 0.13, -5.12);
  const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), leaf);
  foliage.position.set(-6.65, 0.52, -5.12);
  g.add(side, sideTop, back, backTop, potMesh, foliage);

  open.add(g);
}

/** Show the boardroom and hide the departmental furniture, or the reverse. Style corners are only forced off. */
export function setBoardroom(root, on) {
  if (!root) return;
  const rig = root.getObjectByName('boardroom');
  if (rig) rig.visible = !!on;
  const hasFloor = rig?.getObjectByName(FLOOR_NAME);
  root.traverse((o) => {
    if (!o.name || o === rig || under(o, rig)) return;
    if (/^style_/.test(o.name)) { if (on) o.visible = false; return; }
    if (HIDE.test(o.name) || (hasFloor && o.name === 'baked_floor')) o.visible = !on;
  });
}

function under(o, rig) {
  for (let p = o; p; p = p.parent) if (p === rig) return true;
  return false;
}

function mat(color, roughness, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// Chair faces local +z. Seat height matches boardroomLayout().seatY.
function addChair(parent, seatMat, frame, x, z, yaw, s) {
  const g = new THREE.Group();
  g.name = 'boardroom_chair';
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.scale.setScalar(s);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.46), seatMat);
  seat.position.set(0, 0.435, 0.02);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.05), seatMat);
  back.position.set(0, 0.74, -0.21);
  back.rotation.x = -0.1;
  const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(leg, frame);
    m.position.set(sx * 0.19, 0.2, sz * 0.17);
    g.add(m);
  }
  g.add(seat, back);
  parent.add(g);
}
