<?php

namespace Domain\Value\State;

/**
 * 状態
 */
class State
{
    /**
     * 状態の種類
     */
    public const DEFAULT = 0;
    public const INIT = 1;
    public const FINAL = -1;

    protected string $name;
    public function getName() : string
    {
        return $this->name;
    }

    protected int $type;
    public function getType() : int
    {
        return $this->type;
    }

    public function __construct(string $name, int $type = self::DEFAULT)
    {
        $this->name = $name;
        $this->type = $type;
    }

    public function equals(self $state) : bool
    {
        // 参照まで一致する必要はない
        return $this == $state;
    }
}
