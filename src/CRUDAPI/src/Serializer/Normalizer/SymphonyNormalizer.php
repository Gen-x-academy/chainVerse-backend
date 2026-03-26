<?php

namespace App\Serializer\Normalizer;

use App\Entity\Symphony;
use App\Repository\ComposerRepository;
use Symfony\Component\Serializer\Normalizer\ObjectNormalizer;
use Symfony\Component\PropertyAccess\PropertyAccessorInterface;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;
use Symfony\Component\PropertyInfo\PropertyTypeExtractorInterface;
use Symfony\Component\Serializer\NameConverter\NameConverterInterface;
use Symfony\Component\Serializer\Normalizer\CacheableSupportsMethodInterface;
use Symfony\Component\Serializer\Mapping\Factory\ClassMetadataFactoryInterface;


class SymphonyNormalizer extends ObjectNormalizer
{
    public function __construct(
        private ComposerRepository $repo,
        ?ClassMetadataFactoryInterface $classMetadataFactory = null,
        ?NameConverterInterface $nameConverter = null,
        ?PropertyAccessorInterface $propertyAccessor = null,
        ?PropertyTypeExtractorInterface $propertyTypeExtractor = null
    ) {
        $this->repo = $repo;
        parent::__construct($classMetadataFactory, $nameConverter, $propertyAccessor, $propertyTypeExtractor);
    }

    public function normalize($object, string $format = null, array $context = []): array
    {
        $data = parent::normalize($object, $format, $context);

        // TODO: add, edit, or delete some data
        $data['composerId'] = $object->getComposer() ? $object->getComposer()->getId() : null;

        return $data;
    }

    public function supportsNormalization($data, string $format = null, array $context = []): bool
    {
        return $data instanceof Symphony;
    }

    public function denormalize(mixed $data, string $type, string $format = null, array $context = []): mixed
    {
        $symphony = parent::denormalize($data, $type, $format, $context);
        if (empty($data['composerId'])) {
            return $symphony;
        }

        $composer = $this->repo->find($data['composerId']);
        if ($composer) {
            $symphony->setComposer($composer);
        }

        return $symphony;
    }

    public function supportsDenormalization(mixed $data, string $type, string $format = null, array $context = []): bool
    {
        return $type == \App\Entity\Symphony::class;
    }
}
