import PartAssembler from './shared/PartAssembler.jsx';
import { saveAssembledDress } from '../../api/assets.js';

const DRESS_PART_TYPES = [
  { id: 'cloth', label: 'Cloth' },
  { id: 'hands', label: 'Hands' },
  { id: 'filter', label: 'Filter' },
];

export default function DressBuilder() {
  return (
    <PartAssembler
      title="Dress Builder"
      libraryCategory="DRESS_PART"
      partTypes={DRESS_PART_TYPES}
      onSave={saveAssembledDress}
      nameLabel="Outfit name…"
      savedCategory="DRESS"
    />
  );
}
