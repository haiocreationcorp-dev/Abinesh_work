import PartAssembler from './shared/PartAssembler.jsx';
import { saveAssembledFace, updateAssembledFace } from '../../api/assets.js';
import { FACE_PART_TYPES } from '../../constants/categories.js';

export default function FaceBuilder() {
  return (
    <PartAssembler
      title="Face Builder"
      libraryCategory="FACE_PART"
      partTypes={FACE_PART_TYPES}
      onSave={saveAssembledFace}
      onUpdate={updateAssembledFace}
      nameLabel="Face name…"
      savedCategory="FACE_TEMPLATE"
      enableFacePartAlignment
    />
  );
}
