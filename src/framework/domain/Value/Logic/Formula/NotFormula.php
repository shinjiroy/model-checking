<?php

namespace Domain\Value\Logic\Formula;

/**
 * 否定論理式(not A)
 */
class NotFormula implements Formula
{
    protected Formula $fml;

    /**
     * not $fml
     *
     * @param Formula $fml
     */
    public function __construct(Formula $fml)
    {
        $this->fml = $fml;
    }

    public function __invoke(...$args) : bool
    {
        $result1 = ($this->fml)(...$args);
        // 原子論理式の時点でbool値を返すことは保証されている
        return !$result1;
    }
}
