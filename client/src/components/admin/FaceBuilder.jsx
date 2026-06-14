import PartAssembler from './shared/PartAssembler.jsx';
import { saveAssembledFace } from '../../api/assets.js';

const FACE_PART_TYPES = [
  { id: 'eye', label: 'Eye' },
  { id: 'nose', label: 'Nose' },
  { id: 'mouth', label: 'Mouth' },
  { id: 'face', label: 'Face' },
  { id: 'hairstyle', label: 'Hairstyle' },
];

export default function FaceBuilder() {
  return (
    <PartAssembler
      title="Face Builder"
      libraryCategory="FACE_PART"
      partTypes={FACE_PART_TYPES}
      onSave={saveAssembledFace}
      nameLabel="Face name…"
      savedCategory="FACE"
      expressionsCategory="EXPRESSION"
      enableFacePartAlignment
    />
  );
}
