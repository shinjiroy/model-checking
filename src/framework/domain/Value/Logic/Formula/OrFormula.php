<?php

namespace Domain\Value\Logic\Formula;

use TypeError;

/**
 * 論理和
 * 
 * $fml = new OrFormula($fml1, $fml2);
 * $fml1Arg = [];
 * $fml2Arg = [];
 * $fml($fml1Arg, $fml2Arg);
 */
class OrFormula implements Formula
{
    private Formula $fml1;
    private Formula $fml2;

    /**
     * $fml1 or $fml2
     *
     * @param Formula $fml1
     * @param Formula $fml2
     */
    public function __construct(Formula $fml1, Formula $fml2)
    {
        $this->fml1 = $fml1;
        $this->fml2 = $fml2;
    }

    public function __invoke(...$args) : bool
    {
        $result1 = ($this->fml1)(...($args[0] ?? []));
        $result2 = ($this->fml2)(...($args[1] ?? []));
        // 原子論理式の時点で2つともbool値を返すことは保証されている
        return $result1 || $result2;
    }
}
